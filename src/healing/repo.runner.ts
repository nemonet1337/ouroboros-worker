/**
 * プロセス内 HealingRunner + CodeRunner。
 * 旧 ouroborous-runner Worker のロジックを統合したもの。
 * GitHub API は GitHubProvider、AI は AiProvider、セッション状態は D1 経由。
 */
import type { AiProvider } from "../ports/ai";
import type { DbAdapter } from "../ports/db";
import type {
  CodeCommitResult,
  CodeDiffResult,
  CodeGenerateResult,
  CodeInitOptions,
  CodeInitResult,
  CodeReadResult,
  CodeRunner,
  CodeSearchResult,
  CodeWriteResult,
  HealingRunner,
  RunFixOptions,
  RunnerFixResult,
  RunnerScanResult,
} from "../ports/runner";
import type { Patch } from "../types";
import type { GitHubProvider } from "../vcs/github.provider";
import { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "../config/deployment";
import { buildCodeGenPrompt } from "../code/prompt.templates";
import { scanFiles } from "./scanner";
import { createPatch } from "diff";

export class RepoRunner implements HealingRunner, CodeRunner {
  readonly kind = "local" as const;

  constructor(
    private readonly vcs: GitHubProvider,
    private readonly ai: AiProvider,
    private readonly db: DbAdapter
  ) {}

  // ── Healing ──────────────────────────────────────────────────────────────

  async scan(): Promise<RunnerScanResult> {
    if (!this.vcs.owner || !this.vcs.repo) {
      throw new Error("対象リポジトリが設定されていません（settings.selected_repo を確認してください）");
    }
    const files = await this.vcs.getRepoFiles(500);
    const findings = scanFiles(files);
    return {
      findings: {
        staticAnalysis: findings.staticAnalysis.map((f) => ({
          id: f.id,
          ruleId: f.ruleId ?? f.id,
          title: f.title,
          message: f.message,
          severity: f.severity,
          file: f.file,
          line: f.line,
          framework: f.framework as any,
        })),
        dependency: findings.dependency as any,
        performance: findings.performance as any,
        secrets: findings.secrets as any,
        licenses: findings.licenses.map((path) => ({
          type: "license" as const,
          file: path,
          packageName: "",
          license: "UNKNOWN",
          status: "unknown" as const,
          description: `License file detected: ${path}`,
        })),
        detectedFrameworks: findings.detectedFrameworks as any,
        timestamp: new Date(),
        commitHash: "",
      },
    };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    if (!this.vcs.owner || !this.vcs.repo) {
      return { success: false, patches: [], validationOutput: "対象リポジトリが未設定", iterations: 0 };
    }

    try {
      const baseBranch = opts.baseBranch || (await this.vcs.getDefaultBranch());
      const baseSha = await this.vcs.getRef(baseBranch);
      const baseTreeSha = await this.vcs.getCommitTreeSha(baseSha);

      // findings に含まれるファイルパスだけを対象にする（全 blob 走査はしない）
      const targetPaths = uniquePaths(
        opts.group.findings.map((f) => {
          const any = f as { file?: string; location?: { file?: string } };
          return any.file || any.location?.file || "";
        }).filter(Boolean)
      );

      const model =
        opts.model && isWorkersAiModelId(opts.model) ? opts.model : DEFAULT_WORKERS_AI_MODEL;

      const patches: Patch[] = [];
      for (const path of targetPaths) {
        const file = await this.vcs.readFileContent(path, baseBranch);
        if (!file) continue;

        const findings = opts.group.findings.filter((f) => {
          const any = f as { file?: string; location?: { file?: string }; message?: string; title?: string };
          return any.file === path || any.location?.file === path;
        });
        if (findings.length === 0) continue;

        const line = findings
          .map((f) => {
            const any = f as { line?: number; location?: { startLine?: number } };
            return any.line ?? any.location?.startLine;
          })
          .find((n): n is number => typeof n === "number");
        const contextLines = opts.contextLines ?? 20;
        const useWindow = file.content.length > 4000 && line !== undefined;
        const snippet = useWindow ? windowAround(file.content, line, contextLines) : file.content;

        const raw = await this.ai.complete({
          model,
          system: useWindow
            ? "You are a code fixer. Return ONLY the replacement for the given excerpt, no explanation."
            : "You are a code fixer. Return ONLY the complete fixed file content, no explanation.",
          prompt: `Fix these issues in ${path}:\n${findings
            .map((f) => {
              const any = f as { message?: string; title?: string };
              return `- ${any.message || any.title || ""}`;
            })
            .join("\n")}\n\n\`\`\`\n${snippet}\n\`\`\``,
          maxTokens: Math.min(8192, 1024 + Math.ceil(snippet.length / 2)),
        });
        const replacement = raw.trim();
        const fixedContent = useWindow
          ? spliceWindow(file.content, line!, contextLines, replacement)
          : replacement;

        patches.push({
          file: path,
          originalContent: file.content,
          fixedContent: fixedContent.trim(),
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
        blobShas.push(await this.vcs.createBlob(patch.fixedContent));
      }

      const treeEntries = patches.map((p, i) => ({ path: p.file, sha: blobShas[i] }));
      const newTreeSha = await this.vcs.createTree(baseTreeSha, treeEntries);
      const commitSha = await this.vcs.createCommit(
        `fix: auto-heal ${patches.length} file(s) [ouroboros]`,
        newTreeSha,
        [baseSha]
      );

      if (!opts.dryRun) {
        await this.vcs.createOrUpdateRef(branch, commitSha);
      }

      return {
        success: true,
        patches,
        branch: opts.dryRun ? undefined : branch,
        validationOutput: `Fixed ${patches.length} file(s) on branch ${branch}`,
        iterations: 1,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, patches: [], validationOutput: message, iterations: 0 };
    }
  }

  // ── Code Mode ────────────────────────────────────────────────────────────

  private async getSession(
    sessionId: string
  ): Promise<{ repoUrl: string; branch: string; baseBranch: string } | null> {
    const rows = await this.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key IN ('repoUrl', 'branch', 'baseBranch')`,
      [sessionId]
    );
    if (rows.length === 0) return null;
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (!map.repoUrl) return null;
    return {
      repoUrl: map.repoUrl,
      branch: map.branch || "main",
      baseBranch: map.baseBranch || "main",
    };
  }

  private async cacheSet(sessionId: string, key: string, value: string): Promise<void> {
    const now = Date.now();
    await this.db.exec(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, key) DO UPDATE SET value = ?, updated_at = ?`,
      [sessionId, key, value, now, value, now]
    );
  }

  private parseOwnerRepo(repoUrl: string): { owner: string; repo: string } | null {
    const [owner, repo] = repoUrl
      .replace(/https:\/\/github\.com\//, "")
      .replace(/\/$/, "")
      .split("/");
    if (!owner || !repo) return null;
    return { owner, repo };
  }

  /** セッション用に一時的に owner/repo を差し替え、処理後に戻す。 */
  private async withRepo<T>(
    owner: string,
    repo: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const prevOwner = this.vcs.owner;
    const prevRepo = this.vcs.repo;
    this.vcs.setRepo(owner, repo);
    try {
      return await fn();
    } finally {
      this.vcs.setRepo(prevOwner, prevRepo);
    }
  }

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    const parsed = this.parseOwnerRepo(opts.repoUrl || "");
    if (!parsed) return { success: false, repoPath: "", fileList: [] };

    const branch = opts.branch || "main";
    let fileList: string[] = [];
    try {
      fileList = await this.withRepo(parsed.owner, parsed.repo, async () => {
        const files = await this.vcs.getRepoFiles(200, branch);
        return files.map((f) => f.path);
      });
    } catch {
      // file list is optional
    }

    await this.cacheSet(opts.sessionId, "repoUrl", opts.repoUrl);
    await this.cacheSet(opts.sessionId, "branch", branch);
    await this.cacheSet(opts.sessionId, "baseBranch", opts.branch || "main");
    if (fileList.length > 0) {
      await this.cacheSet(opts.sessionId, "fileList", JSON.stringify(fileList));
    }

    return {
      success: true,
      repoPath: `https://github.com/${parsed.owner}/${parsed.repo}`,
      fileList,
    };
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { branch: "unknown", changedFiles: [] };

    const rows = await this.db.query<{ key: string }>(
      `SELECT key FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
      [opts.sessionId]
    );
    return {
      branch: session.branch,
      changedFiles: rows.map((r) => r.key.replace("staged:", "")),
    };
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { files: [] };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { files: [] };

    const result: { path: string; content: string }[] = [];
    await this.withRepo(parsed.owner, parsed.repo, async () => {
      for (const p of opts.paths) {
        const staged = await this.db.query<{ value: string }>(
          `SELECT value FROM code_session_cache WHERE session_id = ? AND key = ?`,
          [opts.sessionId, `staged:${p}`]
        );
        if (staged[0]) {
          result.push({ path: p, content: staged[0].value });
          continue;
        }
        const file = await this.vcs.readFileContent(p, session.branch);
        if (file) result.push({ path: p, content: file.content });
      }
    });
    return { files: result };
  }

  async search(opts: {
    sessionId: string;
    query: string;
    type: "grep" | "glob";
  }): Promise<CodeSearchResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { results: [] };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { results: [] };

    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const results: { file: string; line: number; content: string }[] = [];
      const globPattern =
        opts.type === "glob"
          ? new RegExp(
              `^${opts.query.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`
            )
          : null;

      if (globPattern) {
        const cached = await this.db.query<{ value: string }>(
          `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'fileList'`,
          [opts.sessionId]
        );
        let paths: string[] = [];
        if (cached[0]?.value) {
          try {
            paths = JSON.parse(cached[0].value) as string[];
          } catch {
            paths = [];
          }
        }
        if (paths.length === 0) {
          const files = await this.vcs.getRepoFiles(80, session.branch);
          paths = files.map((f) => f.path);
        }
        for (const p of paths) {
          if (globPattern.test(p)) results.push({ file: p, line: 1, content: "" });
        }
        return { results: results.slice(0, 500) };
      }

      const files = await this.vcs.getRepoFiles(80, session.branch);
      for (const file of files) {
        const lines = file.content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(opts.query)) {
            results.push({ file: file.path, line: i + 1, content: lines[i].slice(0, 200) });
          }
        }
      }
      return { results: results.slice(0, 500) };
    });
  }

  async write(opts: {
    sessionId: string;
    files: { path: string; content: string }[];
  }): Promise<CodeWriteResult> {
    for (const f of opts.files) {
      await this.cacheSet(opts.sessionId, `staged:${f.path}`, f.content);
    }
    return { success: true, files: opts.files.map((f) => f.path) };
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    for (const p of opts.paths) {
      await this.db.exec(`DELETE FROM code_session_cache WHERE session_id = ? AND key = ?`, [
        opts.sessionId,
        `staged:${p}`,
      ]);
    }
    return { success: true };
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { diffs: [] };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { diffs: [] };

    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const rows = await this.db.query<{ key: string; value: string }>(
        `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
        [opts.sessionId]
      );
      const diffs: { path: string; diff: string }[] = [];
      for (const row of rows) {
        const path = row.key.replace("staged:", "");
        const original = await this.vcs.readFileContent(path, session.branch);
        diffs.push({ path, diff: generateDiff(path, original?.content || "", row.value) });
      }
      return { diffs };
    });
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false, commitHash: "" };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { success: false, commitHash: "" };

    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const rows = await this.db.query<{ key: string; value: string }>(
        `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
        [opts.sessionId]
      );
      if (rows.length === 0) return { success: false, commitHash: "" };

      const baseSha = await this.vcs.getRef(session.branch);
      const baseTreeSha = await this.vcs.getCommitTreeSha(baseSha);

      const blobShas: { path: string; sha: string }[] = [];
      for (const row of rows) {
        const path = row.key.replace("staged:", "");
        blobShas.push({ path, sha: await this.vcs.createBlob(row.value) });
      }

      const treeSha = await this.vcs.createTree(baseTreeSha, blobShas);
      const commitSha = await this.vcs.createCommit(opts.message, treeSha, [baseSha]);
      await this.cacheSet(opts.sessionId, "lastCommitSha", commitSha);
      return { success: true, commitHash: commitSha };
    });
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { success: false };

    return this.withRepo(parsed.owner, parsed.repo, async () => {
      const rows = await this.db.query<{ value: string }>(
        `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'lastCommitSha'`,
        [opts.sessionId]
      );
      if (!rows[0]) return { success: false };
      await this.vcs.createOrUpdateRef(opts.branch, rows[0].value);
      return { success: true };
    });
  }

  async generate(opts: {
    sessionId: string;
    instruction: string;
    model?: string;
  }): Promise<CodeGenerateResult> {
    const model =
      opts.model && isWorkersAiModelId(opts.model) ? opts.model : DEFAULT_WORKERS_AI_MODEL;

    const session = await this.getSession(opts.sessionId);
    if (!session) return { patches: [], model, error: "session not found" };
    const parsed = this.parseOwnerRepo(session.repoUrl);
    if (!parsed) return { patches: [], model, error: "invalid repo url" };

    return this.withRepo(parsed.owner, parsed.repo, async () => {
      let fileList: string[] = [];
      let fileContext: Record<string, string> = {};
      try {
        const cached = await this.db.query<{ value: string }>(
          `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'fileList'`,
          [opts.sessionId]
        );
        if (cached[0]?.value) {
          try {
            fileList = JSON.parse(cached[0].value) as string[];
          } catch {
            fileList = [];
          }
        }
        if (fileList.length === 0) {
          const files = await this.vcs.getRepoFiles(80, session.branch);
          fileList = files.map((f) => f.path);
          await this.cacheSet(opts.sessionId, "fileList", JSON.stringify(fileList));
        }
        const picked = pickContextPaths(fileList, opts.instruction, 8);
        let chars = 0;
        for (const p of picked) {
          if (chars >= 8_000) break;
          const file = await this.vcs.readFileContent(p, session.branch);
          if (!file) continue;
          const slice = file.content.slice(0, 4_000);
          fileContext[p] = slice;
          chars += slice.length;
        }
      } catch {
        // proceed without file context
      }

      const { system, user } = buildCodeGenPrompt({
        instruction: opts.instruction,
        repoStructure: fileList,
        fileContext,
      });

      const raw = await this.ai.complete({
        model,
        system,
        prompt: user,
        maxTokens: 8192,
      });

      const parsedPatches = parseGeneratedPatches(raw);
      return { patches: parsedPatches.patches, model, error: parsedPatches.error };
    });
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

/** markdown フェンスと reasoning 前文を剥がして patches JSON を取り出す。 */
export function parseGeneratedPatches(raw: string): { patches: Patch[]; error?: string } {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const candidates = [cleaned];
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(cleaned.slice(braceStart, braceEnd + 1));
  }
  const bracketStart = cleaned.indexOf("[");
  const bracketEnd = cleaned.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    candidates.push(cleaned.slice(bracketStart, bracketEnd + 1));
  }

  let lastErr = `AI 応答の JSON パースに失敗しました: ${cleaned.slice(0, 200)}`;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { patches?: unknown } | unknown[];
      if (Array.isArray(parsed)) return { patches: parsed as Patch[] };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.patches)) {
        return { patches: parsed.patches as Patch[] };
      }
      lastErr = "AI の応答に patches 配列が含まれていませんでした。";
    } catch {
      // try next candidate
    }
  }
  return { patches: [], error: lastErr };
}

function generateDiff(path: string, original: string, modified: string): string {
  return createPatch(path, original, modified);
}

function windowAround(content: string, line: number, contextLines: number): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  return lines.slice(start, end).join("\n");
}

function spliceWindow(content: string, line: number, contextLines: number, replacement: string): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);
  return [...lines.slice(0, start), ...replacement.split("\n"), ...lines.slice(end)].join("\n");
}

function pickContextPaths(fileList: string[], instruction: string, limit: number): string[] {
  const tokens = instruction
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .filter((t) => t.length > 2);
  const scored = fileList.map((p) => {
    const lower = p.toLowerCase();
    const hits = tokens.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { p, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((s) => s.hits > 0).map((s) => s.p);
  const rest = scored.filter((s) => s.hits === 0).map((s) => s.p);
  return [...matched, ...rest].slice(0, limit);
}
