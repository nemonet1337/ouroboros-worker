import type { DynamicWorkerLoader } from "../env";
import type { DbAdapter } from "../ports/db";
import type {
  HealingRunner,
  RunFixOptions,
  RunnerFixResult,
  RunnerScanResult,
  CodeRunner,
  CodeInitOptions,
  CodeInitResult,
  CodeReadResult,
  CodeSearchResult,
  CodeWriteResult,
  CodeDiffResult,
  CodeCommitResult,
  CodeGenerateResult,
} from "../ports/runner";
import { normalizeAllFindings } from "../utils/findings.normalize";
import { DYNAMIC_WORKER_SOURCE } from "./dynamic-worker.source";

export interface DynamicRunnerOptions {
  /** Workers AI バインディング（動的 Worker の env へ受け渡す） */
  ai: Ai;
  /** code_session_cache へアクセスする D1 アダプター（セッション操作はホスト側で処理） */
  db: DbAdapter;
  githubToken: string;
  /** owner/repo 形式 */
  repository: string;
  codeModel?: string;
}

const DYNAMIC_WORKER_ID = "ouroboros-dynamic-runner";

/**
 * Worker Loader（Dynamic Worker Loading）でタスク実行時に Worker を動的生成する
 * ランナー。事前デプロイ済みの ouroboros-runner が無い環境でも scan / heal /
 * code generate を実行できる。
 *
 * - 計算/AI/一括ファイル処理（scan・heal・generate）→ 動的 Worker へ委譲
 * - ステートフルなセッション操作（init/read/write/commit/push 等）→ ホスト側で
 *   code_session_cache（D1）+ GitHub REST を直接操作
 */
export class DynamicRunner implements HealingRunner, CodeRunner {
  readonly kind = "rpc" as const;

  constructor(
    private readonly loader: DynamicWorkerLoader,
    private readonly opts: DynamicRunnerOptions
  ) {}

  // ── 動的 Worker への委譲 ──────────────────────────────────────────────────

  private async callDynamicWorker<T>(path: string, body: unknown): Promise<T> {
    const stub = this.loader.get(DYNAMIC_WORKER_ID, () => ({
      compatibilityDate: "2024-11-01",
      mainModule: "runner.js",
      modules: { "runner.js": DYNAMIC_WORKER_SOURCE },
      env: {
        AI: this.opts.ai,
        GITHUB_TOKEN: this.opts.githubToken,
        GITHUB_REPOSITORY: this.opts.repository,
        OURO_CODE_MODEL: this.opts.codeModel,
      },
      // globalOutbound は省略: 動的 Worker から GitHub API へ到達できる必要がある
    }));
    const res = await stub.getEntrypoint().fetch(
      new Request(`http://dynamic${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      })
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`dynamic runner ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  async scan(): Promise<RunnerScanResult> {
    const raw = await this.callDynamicWorker<unknown>("/internal/scan", {});
    return { findings: normalizeAllFindings(raw) };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    return this.callDynamicWorker<RunnerFixResult>("/internal/heal", {
      group: opts.group,
      dryRun: opts.dryRun,
      baseBranch: opts.baseBranch,
      branchPrefix: opts.branchPrefix,
    });
  }

  async generate(opts: { sessionId: string; instruction: string; model?: string }): Promise<CodeGenerateResult> {
    return this.callDynamicWorker<CodeGenerateResult>("/internal/code/generate", opts);
  }

  // ── ホスト側セッション操作（code_session_cache + GitHub REST）──────────────

  private ghHeaders(hasBody = false): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${this.opts.githubToken}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-dynamic-runner",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    };
  }

  private async gh<T>(repo: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      ...init,
      headers: { ...this.ghHeaders(!!init?.body), ...init?.headers },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  private async getFileContent(repo: string, path: string, ref: string): Promise<string | null> {
    try {
      const result = await this.gh<{ content: string; encoding: string }>(
        repo,
        `/contents/${path}?ref=${encodeURIComponent(ref)}`
      );
      if (result.encoding !== "base64") return null;
      return atob(result.content.replace(/\n/g, ""));
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) return null;
      throw e;
    }
  }

  private async setCache(sessionId: string, key: string, value: string): Promise<void> {
    const now = Date.now();
    await this.opts.db.exec(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [sessionId, key, value, now]
    );
  }

  private async getCache(sessionId: string, key: string): Promise<string | undefined> {
    const rows = await this.opts.db.query<{ value: string }>(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = ?`,
      [sessionId, key]
    );
    return rows[0]?.value;
  }

  private async getSession(sessionId: string): Promise<{ repo: string; branch: string } | null> {
    const repoUrl = await this.getCache(sessionId, "repoUrl");
    if (!repoUrl) return null;
    const repo = repoUrl.replace(/https:\/\/github\.com\//, "").replace(/\/$/, "");
    const branch = (await this.getCache(sessionId, "branch")) || "main";
    return repo.includes("/") ? { repo, branch } : null;
  }

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    const repo = (opts.repoUrl || "").replace(/https:\/\/github\.com\//, "").replace(/\/$/, "");
    if (!repo.includes("/")) return { success: false, repoPath: "", fileList: [] };

    const branch = opts.branch || "main";
    let fileList: string[] = [];
    try {
      const ref = await this.gh<{ object: { sha: string } }>(repo, `/git/refs/heads/${encodeURIComponent(branch)}`);
      const tree = await this.gh<{ tree: Array<{ path: string; type: string }> }>(
        repo,
        `/git/trees/${ref.object.sha}?recursive=1`
      );
      fileList = tree.tree.filter((e) => e.type === "blob").slice(0, 200).map((e) => e.path);
    } catch {
      // file list is optional
    }

    await this.setCache(opts.sessionId, "repoUrl", opts.repoUrl);
    await this.setCache(opts.sessionId, "branch", branch);
    await this.setCache(opts.sessionId, "baseBranch", branch);

    return { success: true, repoPath: `https://github.com/${repo}`, fileList };
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { branch: "unknown", changedFiles: [] };
    const rows = await this.opts.db.query<{ key: string }>(
      `SELECT key FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
      [opts.sessionId]
    );
    return { branch: session.branch, changedFiles: rows.map((r) => r.key.replace("staged:", "")) };
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { files: [] };

    const files: { path: string; content: string }[] = [];
    for (const p of opts.paths) {
      const staged = await this.getCache(opts.sessionId, `staged:${p}`);
      if (staged !== undefined) {
        files.push({ path: p, content: staged });
        continue;
      }
      const content = await this.getFileContent(session.repo, p, session.branch);
      if (content !== null) files.push({ path: p, content });
    }
    return { files };
  }

  async search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { results: [] };

    const ref = await this.gh<{ object: { sha: string } }>(
      session.repo,
      `/git/refs/heads/${encodeURIComponent(session.branch)}`
    );
    const tree = await this.gh<{ tree: Array<{ path: string; type: string; size?: number }> }>(
      session.repo,
      `/git/trees/${ref.object.sha}?recursive=1`
    );
    const paths = tree.tree.filter((e) => e.type === "blob").map((e) => e.path);

    if (opts.type === "glob") {
      const pattern = globToRegExp(opts.query);
      return {
        results: paths.filter((p) => pattern.test(p)).slice(0, 500).map((p) => ({ file: p, line: 1, content: "" })),
      };
    }

    const results: { file: string; line: number; content: string }[] = [];
    for (const p of paths.slice(0, 100)) {
      const content = await this.getFileContent(session.repo, p, session.branch);
      if (content === null) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(opts.query)) {
          results.push({ file: p, line: i + 1, content: lines[i].slice(0, 200) });
          if (results.length >= 500) return { results };
        }
      }
    }
    return { results };
  }

  async write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    for (const f of opts.files) {
      await this.setCache(opts.sessionId, `staged:${f.path}`, f.content);
    }
    return { success: true, files: opts.files.map((f) => f.path) };
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    for (const p of opts.paths) {
      await this.opts.db.exec(`DELETE FROM code_session_cache WHERE session_id = ? AND key = ?`, [
        opts.sessionId,
        `staged:${p}`,
      ]);
    }
    return { success: true };
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { diffs: [] };

    const rows = await this.opts.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
      [opts.sessionId]
    );
    const diffs: { path: string; diff: string }[] = [];
    for (const row of rows) {
      const path = row.key.replace("staged:", "");
      const original = (await this.getFileContent(session.repo, path, session.branch)) ?? "";
      diffs.push({ path, diff: generateDiff(path, original, row.value) });
    }
    return { diffs };
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false, commitHash: "" };

    const rows = await this.opts.db.query<{ key: string; value: string }>(
      `SELECT key, value FROM code_session_cache WHERE session_id = ? AND key LIKE 'staged:%'`,
      [opts.sessionId]
    );
    if (rows.length === 0) return { success: false, commitHash: "" };

    const ref = await this.gh<{ object: { sha: string } }>(
      session.repo,
      `/git/refs/heads/${encodeURIComponent(session.branch)}`
    );
    const baseSha = ref.object.sha;

    const treeEntries: Array<{ path: string; mode: string; type: "blob"; sha: string }> = [];
    for (const row of rows) {
      const blob = await this.gh<{ sha: string }>(session.repo, `/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: row.value, encoding: "utf-8" }),
      });
      treeEntries.push({ path: row.key.replace("staged:", ""), mode: "100644", type: "blob", sha: blob.sha });
    }

    const tree = await this.gh<{ sha: string }>(session.repo, `/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseSha, tree: treeEntries }),
    });
    const commit = await this.gh<{ sha: string }>(session.repo, `/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message: opts.message, tree: tree.sha, parents: [baseSha] }),
    });

    await this.setCache(opts.sessionId, "lastCommitSha", commit.sha);
    return { success: true, commitHash: commit.sha };
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    const session = await this.getSession(opts.sessionId);
    if (!session) return { success: false };

    const commitSha = await this.getCache(opts.sessionId, "lastCommitSha");
    if (!commitSha) return { success: false };

    // 新規ブランチは POST /git/refs、既存なら PATCH で更新
    try {
      await this.gh(session.repo, `/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${opts.branch}`, sha: commitSha }),
      });
    } catch {
      await this.gh(session.repo, `/git/refs/heads/${encodeURIComponent(opts.branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitSha, force: false }),
      });
    }
    return { success: true };
  }
}

/**
 * glob パターンを正規表現へ安全に変換する。バックスラッシュを含む全ての
 * 正規表現メタ文字を先にエスケープし、* / ? のみワイルドカードとして展開する。
 */
function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

/** runner/src/index.ts の generateDiff と同等の簡易 unified diff 生成 */
function generateDiff(path: string, original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const output: string[] = [`--- a/${path}`, `+++ b/${path}`];

  const maxLen = Math.max(origLines.length, modLines.length);
  let hunkHeader = false;

  for (let i = 0; i < maxLen; i++) {
    const orig = i < origLines.length ? origLines[i] : undefined;
    const mod = i < modLines.length ? modLines[i] : undefined;
    if (orig === mod) continue;
    if (!hunkHeader) {
      output.push(`@@ -${i + 1},${origLines.length} +${i + 1},${modLines.length} @@`);
      hunkHeader = true;
    }
    if (orig !== undefined) output.push(`-${orig}`);
    if (mod !== undefined) output.push(`+${mod}`);
  }

  return output.join("\n");
}
