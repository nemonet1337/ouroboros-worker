import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "./env";
import { GitHubClient } from "./github.client";
import { scanFiles, type Finding } from "./scanner";
import { buildCodeGenPrompt } from "./prompt.templates";
import { isWorkersAiModelId } from "./model.util";
import type {
  AllFindings, FindingGroup, CodeInitOptions,
  CodeInitResult, CodeReadResult, CodeSearchResult, CodeWriteResult, CodeDiffResult, CodeCommitResult,
  RunFixOptions, RunnerFixResult,
  CodeGenerateOptions, CodeGenerateResult, Patch,
} from "./env";

export default class RunnerWorker extends WorkerEntrypoint<Env> {
  // ── fetch() router ────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405, headers: { "content-type": "application/json" },
      });
    }

    const secret = this.env.RUNNER_SHARED_SECRET;
    if (secret) {
      const provided = request.headers.get("x-runner-secret");
      if (provided !== secret) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401, headers: { "content-type": "application/json" },
        });
      }
    }

    try {
      const body = request.body ? await request.json() : {};
      let result: unknown;

      switch (path) {
        case "/internal/scan":
          result = await this.scan();
          break;
        case "/internal/heal":
          result = await this.applyFix(body as RunFixOptions);
          break;
        case "/internal/code/init":
          result = await this.codeInit(body as CodeInitOptions);
          break;
        case "/internal/code/status":
          result = await this.codeStatus(body as { sessionId: string });
          break;
        case "/internal/code/read":
          result = await this.codeRead(body as { sessionId: string; paths: string[] });
          break;
        case "/internal/code/search":
          result = await this.codeSearch(body as { sessionId: string; query: string; type: "grep" | "glob" });
          break;
        case "/internal/code/write":
          result = await this.codeWrite(body as { sessionId: string; files: { path: string; content: string }[] });
          break;
        case "/internal/code/delete":
          result = await this.codeDelete(body as { sessionId: string; paths: string[] });
          break;
        case "/internal/code/diff":
          result = await this.codeDiff(body as { sessionId: string });
          break;
        case "/internal/code/commit":
          result = await this.codeCommit(body as { sessionId: string; message: string });
          break;
        case "/internal/code/push":
          result = await this.codePush(body as { sessionId: string; branch: string });
          break;
        case "/internal/code/generate":
          result = await this.codeGenerate(body as CodeGenerateOptions);
          break;
        default:
          return new Response(null, { status: 404 });
      }

      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { "content-type": "application/json" },
      });
    }
  }

  // ── Healing: scan ─────────────────────────────────────────────────────────

  async scan(_repoUrl?: string, _branch?: string): Promise<AllFindings> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const repo = this.env.GITHUB_REPOSITORY || "";
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      return {
        staticAnalysis: [], dependency: [], performance: [], secrets: [],
        licenses: [], detectedFrameworks: [], timestamp: new Date(), commitHash: "",
      };
    }

    const gh = new GitHubClient(token, owner, repoName);
    const files = await gh.getRepoFiles(owner, repoName, undefined, 500);
    const findings = scanFiles(files);

    return {
      ...findings,
      timestamp: new Date(),
      commitHash: "",
    };
  }

  // ── Healing: applyFix ─────────────────────────────────────────────────────

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const repo = this.env.GITHUB_REPOSITORY || "";
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      return { success: false, patches: [], validationOutput: "GITHUB_REPOSITORY not configured", iterations: 0 };
    }

    const gh = new GitHubClient(token, owner, repoName);

    if (!this.env.AI) {
      return { success: false, patches: [], validationOutput: "Workers AI binding not available", iterations: 0 };
    }

    try {
      const baseBranch = opts.baseBranch || await gh.getDefaultBranch(owner, repoName);
      const baseSha = await gh.getRef(owner, repoName, baseBranch);
      const tree = await gh.getTree(owner, repoName, baseSha);
      const blobEntries = tree.tree.filter((e) => e.type === "blob").slice(0, 100);

      const patches: Array<{ file: string; originalContent: string; fixedContent: string; diff: string; explanation: string }> = [];

      for (const entry of blobEntries) {
        const file = await gh.getFileContent(owner, repoName, entry.path, baseBranch);
        if (!file) continue;

        const findings = opts.group.findings.filter((f: any) => f.file === entry.path || f.location?.file === entry.path);
        if (findings.length === 0) continue;

        const model = this.env.OURO_CODE_MODEL || "@cf/meta/llama-3.1-8b-instruct";
        const response = await this.env.AI.run(model, {
          messages: [
            { role: "system", content: "You are a code fixer. Fix the following code issues. Return ONLY the fixed file content, no explanation." },
            { role: "user", content: `Fix these issues in the file:\n${findings.map((f: any) => `- ${f.message || f.title}`).join("\n")}\n\nOriginal file:\n\`\`\`\n${file.content}\n\`\`\`` },
          ],
        });

        const fixedContent = typeof response === "object" && response !== null && "response" in response
          ? (response as any).response
          : String(response);

        patches.push({
          file: entry.path,
          originalContent: file.content,
          fixedContent,
          diff: "",
          explanation: `Auto-fixed ${findings.length} issue(s)`,
        });
      }

      if (patches.length === 0) {
        return { success: false, patches: [], validationOutput: "No fixable files found", iterations: 0 };
      }

      const branch = opts.branchPrefix
        ? `${opts.branchPrefix}-${crypto.randomUUID().slice(0, 8)}`
        : `ouro-fix-${crypto.randomUUID().slice(0, 8)}`;

      const blobShas: string[] = [];
      for (const patch of patches) {
        const sha = await gh.createBlob(owner, repoName, patch.fixedContent);
        blobShas.push(sha);
      }

      const treeEntries = patches.map((p, i) => ({
        path: p.file,
        sha: blobShas[i],
      }));
      const newTreeSha = await gh.createTree(owner, repoName, baseSha, treeEntries);
      const commitSha = await gh.createCommit(owner, repoName, `fix: auto-heal ${patches.length} file(s) [ouroboros]`, newTreeSha, [baseSha]);

      if (!opts.dryRun) {
        await gh.updateRef(owner, repoName, branch, commitSha);
      }

      return {
        success: true,
        patches: patches.map((p) => ({
          file: p.file,
          originalContent: p.originalContent,
          fixedContent: p.fixedContent,
          diff: p.diff,
          explanation: p.explanation,
        })),
        branch: opts.dryRun ? undefined : branch,
        validationOutput: `Fixed ${patches.length} file(s) on branch ${branch}`,
        iterations: 1,
      };
    } catch (err: any) {
      return { success: false, patches: [], validationOutput: err.message, iterations: 0 };
    }
  }

  // ── Code Mode ─────────────────────────────────────────────────────────────

  private async getSession(sessionId: string): Promise<{ repoUrl: string; branch: string; baseBranch: string } | null> {
    const row = await this.env.DB.prepare(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'repoUrl'`
    ).bind(sessionId).first<{ value: string }>();
    if (!row) return null;
    const repoUrl = row.value;
    const branchRow = await this.env.DB.prepare(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'branch'`
    ).bind(sessionId).first<{ value: string }>();
    const baseBranchRow = await this.env.DB.prepare(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'baseBranch'`
    ).bind(sessionId).first<{ value: string }>();
    return {
      repoUrl,
      branch: branchRow?.value || "main",
      baseBranch: baseBranchRow?.value || "main",
    };
  }

  async codeInit(opts: CodeInitOptions): Promise<CodeInitResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const [repoOwner, repoName] = (opts.repoUrl || "").replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");

    if (!repoOwner || !repoName) {
      return { success: false, repoPath: "", fileList: [] };
    }

    const branch = opts.branch || "main";
    const gh = new GitHubClient(token, repoOwner, repoName);
    let fileList: string[] = [];
    try {
      const files = await gh.getRepoFiles(repoOwner, repoName, branch, 200);
      fileList = files.map((f) => f.path);
    } catch {
      // file list is optional
    }

    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, 'repoUrl', ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`
    ).bind(opts.sessionId, opts.repoUrl, now, opts.repoUrl, now).run();
    await this.env.DB.prepare(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, 'branch', ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`
    ).bind(opts.sessionId, branch, now, branch, now).run();
    await this.env.DB.prepare(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, 'baseBranch', ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`
    ).bind(opts.sessionId, opts.branch || "main", now, opts.branch || "main", now).run();

    return { success: true, repoPath: `https://github.com/${repoOwner}/${repoName}`, fileList };
  }

  async codeStatus(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { branch: "unknown", changedFiles: [] };

    const rows = await this.env.DB.prepare(
      `SELECT key FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`
    ).bind(opts.sessionId).all<{ key: string }>();
    const changedFiles = rows.results.map((r) => r.key.replace("staged:", ""));
    return { branch: session.branch, changedFiles };
  }

  async codeRead(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const session = await this.getSession(opts.sessionId);
    if (!session) return { files: [] };

    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { files: [] };

    const gh = new GitHubClient(token, owner, repoName);
    const result: { path: string; content: string }[] = [];

    for (const p of opts.paths) {
      const staged = await this.env.DB.prepare(
        `SELECT value FROM code_session_cache WHERE session_id = ? AND key = ?`
      ).bind(opts.sessionId, `staged:${p}`).first<{ value: string }>();
      if (staged) {
        result.push({ path: p, content: staged.value });
        continue;
      }
      const file = await gh.getFileContent(owner, repoName, p, session.branch);
      if (file) {
        result.push({ path: p, content: file.content });
      }
    }

    return { files: result };
  }

  async codeSearch(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const session = await this.getSession(opts.sessionId);
    if (!session) return { results: [] };

    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { results: [] };

    const gh = new GitHubClient(token, owner, repoName);
    const files = await gh.getRepoFiles(owner, repoName, session.branch, 500);
    const results: { file: string; line: number; content: string }[] = [];

    // glob → 正規表現: メタ文字（バックスラッシュ含む）を全てエスケープしてから * / ? を展開
    const globPattern = opts.type === "glob"
      ? new RegExp(`^${opts.query.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`)
      : null;

    const candidateFiles = globPattern
      ? files.filter((f) => globPattern.test(f.path))
      : files;

    for (const file of candidateFiles.slice(0, 100)) {
      if (opts.type === "grep") {
        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(opts.query)) {
            results.push({ file: file.path, line: i + 1, content: lines[i].slice(0, 200) });
          }
        }
      } else {
        results.push({ file: file.path, line: 1, content: "" });
      }
    }

    return { results: results.slice(0, 500) };
  }

  async codeWrite(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    const now = Date.now();
    for (const f of opts.files) {
      await this.env.DB.prepare(
        `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`
      ).bind(opts.sessionId, `staged:${f.path}`, f.content, now, f.content, now).run();
    }
    return { success: true, files: opts.files.map((f) => f.path) };
  }

  async codeDelete(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    for (const p of opts.paths) {
      await this.env.DB.prepare(
        `DELETE FROM code_session_cache WHERE session_id = ? AND key = ?`
      ).bind(opts.sessionId, `staged:${p}`).run();
    }
    return { success: true };
  }

  async codeDiff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const session = await this.getSession(opts.sessionId);
    if (!session) return { diffs: [] };

    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { diffs: [] };

    const gh = new GitHubClient(token, owner, repoName);
    const rows = await this.env.DB.prepare(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`
    ).bind(opts.sessionId).all<{ key: string; value: string }>();
    const diffs: { path: string; diff: string }[] = [];

    for (const row of rows.results) {
      const path = row.key.replace("staged:", "");
      const original = await gh.getFileContent(owner, repoName, path, session.branch);
      const originalContent = original?.content || "";
      const diff = generateDiff(path, originalContent, row.value);
      diffs.push({ path, diff });
    }

    return { diffs };
  }

  async codeCommit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false, commitHash: "" };

    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { success: false, commitHash: "" };

    const gh = new GitHubClient(token, owner, repoName);
    const rows = await this.env.DB.prepare(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`
    ).bind(opts.sessionId).all<{ key: string; value: string }>();

    if (rows.results.length === 0) return { success: false, commitHash: "" };

    const baseSha = await gh.getRef(owner, repoName, session.branch);

    const blobShas: { path: string; sha: string }[] = [];
    for (const row of rows.results) {
      const path = row.key.replace("staged:", "");
      const sha = await gh.createBlob(owner, repoName, row.value);
      blobShas.push({ path, sha });
    }

    const treeSha = await gh.createTree(owner, repoName, baseSha, blobShas);
    const commitSha = await gh.createCommit(owner, repoName, opts.message, treeSha, [baseSha]);

    const now = Date.now();
    await this.env.DB.prepare(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`
    ).bind(opts.sessionId, "lastCommitSha", commitSha, now, commitSha, now).run();

    return { success: true, commitHash: commitSha };
  }

  async codePush(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false };

    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { success: false };

    const gh = new GitHubClient(token, owner, repoName);
    const commitRow = await this.env.DB.prepare(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'lastCommitSha'`
    ).bind(opts.sessionId).first<{ value: string }>();
    if (!commitRow) return { success: false };

    await gh.updateRef(owner, repoName, opts.branch, commitRow.value);
    return { success: true };
  }

  async codeGenerate(opts: CodeGenerateOptions): Promise<CodeGenerateResult> {
    if (!this.env.AI) {
      return { patches: [], model: "" };
    }

    const model = opts.model && isWorkersAiModelId(opts.model)
      ? opts.model
      : (this.env.OURO_CODE_MODEL || "@cf/meta/llama-3.1-8b-instruct");

    const session = await this.getSession(opts.sessionId);
    if (!session) return { patches: [], model };

    const token = await this.env.GITHUB_TOKEN_SECRET.get();
    const [owner, repoName] = session.repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "").split("/");
    if (!owner || !repoName) return { patches: [], model };

    const gh = new GitHubClient(token, owner, repoName);

    let fileList: string[] = [];
    let fileContext: Record<string, string> = {};
    try {
      const files = await gh.getRepoFiles(owner, repoName, session.branch, 50);
      fileList = files.map((f) => f.path);
      for (const f of files.slice(0, 10)) {
        fileContext[f.path] = f.content;
      }
    } catch {
      // proceed without file context
    }

    const { system, user } = buildCodeGenPrompt({
      instruction: opts.instruction,
      repoStructure: fileList,
      fileContext,
    });

    const aiResponse = await this.env.AI.run(model, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 4096,
    });

    const raw = typeof aiResponse === "object" && aiResponse !== null && "response" in aiResponse
      ? (aiResponse as any).response
      : String(aiResponse ?? "");

    let patches: Patch[] = [];
    let error: string | undefined;
    try {
      const parsed = JSON.parse(raw.trim());
      if (Array.isArray(parsed.patches)) patches = parsed.patches as Patch[];
      else if (Array.isArray(parsed)) patches = parsed as Patch[];
      else error = "AI の応答に patches 配列が含まれていませんでした。";
    } catch {
      error = `AI 応答の JSON パースに失敗しました: ${raw.slice(0, 200)}`;
    }

    return { patches, model, error };
  }
}

function generateDiff(path: string, original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const output: string[] = [`--- a/${path}`, `+++ b/${path}`];

  const maxLen = Math.max(origLines.length, modLines.length);
  let hunkHeader = false;

  for (let i = 0; i < maxLen; i++) {
    if (i < origLines.length && i < modLines.length) {
      if (origLines[i] !== modLines[i]) {
        if (!hunkHeader) {
          output.push(`@@ -${i + 1},${origLines.length} +${i + 1},${modLines.length} @@`);
          hunkHeader = true;
        }
        output.push(`-${origLines[i]}`);
        output.push(`+${modLines[i]}`);
      }
    } else if (i < origLines.length) {
      if (!hunkHeader) {
        output.push(`@@ -${i + 1},${origLines.length} +${i + 1},${modLines.length} @@`);
        hunkHeader = true;
      }
      output.push(`-${origLines[i]}`);
    } else {
      if (!hunkHeader) {
        output.push(`@@ -${i + 1},${origLines.length} +${i + 1},${modLines.length} @@`);
        hunkHeader = true;
      }
      output.push(`+${modLines[i]}`);
    }
  }

  return output.join("\n");
}
