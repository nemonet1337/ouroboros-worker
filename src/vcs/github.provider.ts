import type {
  VcsProvider,
  VcsPullRequest,
  VcsOpenPR,
  VcsPRFile,
  VcsIssue,
  VcsRepo,
  VcsBranch,
  CreatePROptions,
  CreateIssueOptions,
  CheckStatus,
} from "../ports/vcs";

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface ResolvedRepo {
  owner: string;
  repo: string;
}

/**
 * Fetch-based GitHub REST client implementing the VcsProvider port.
 * No Octokit dependency, so it runs on both Node 22 and Cloudflare Workers.
 */
export class GitHubProvider implements VcsProvider {
  readonly name = "github";
  private base: string;

  /**
   * GITHUB_TOKEN から owner/repo を自動検出する。
   * 1. GET /user で認証ユーザーの login を取得 → owner
   * 2. GET /user/repos?sort=updated&per_page=1 で直近更新のリポジトリを取得 → repo
   * トークンが無効またはリポジトリが存在しない場合は null を返す。
   */
  static async resolveRepoFromToken(token: string): Promise<ResolvedRepo | null> {
    const headers = {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-self-healing",
    };
    try {
      const userRes = await fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(10_000) });
      if (!userRes.ok) return null;
      const user = (await userRes.json()) as { login: string };
      const owner = user.login;

      const reposRes = await fetch(
        `https://api.github.com/user/repos?sort=updated&per_page=1`,
        { headers, signal: AbortSignal.timeout(10_000) }
      );
      if (!reposRes.ok) return null;
      const repos = (await reposRes.json()) as Array<{ name: string }>;
      if (repos.length === 0) return null;
      return { owner, repo: repos[0].name };
    } catch {
      return null;
    }
  }

  constructor(private cfg: GitHubConfig) {
    this.base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  }

  /** 現在の対象リポジトリを差し替える（選択リポジトリの切替に使用）。 */
  setRepo(owner: string, repo: string): void {
    this.cfg = { ...this.cfg, owner, repo };
    this.base = `https://api.github.com/repos/${owner}/${repo}`;
  }

  get owner(): string {
    return this.cfg.owner;
  }

  get repo(): string {
    return this.cfg.repo;
  }

  private ghHeaders(hasBody = false): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${this.cfg.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "ouroboros-self-healing",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    };
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { ...this.ghHeaders(!!init?.body), ...init?.headers },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  /** GitHub API call not scoped to a specific repo (e.g. /user/repos, /repos/:o/:r/branches). */
  private async apiRoot<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: this.ghHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GitHub API ${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as T;
  }

  /**
   * リポジトリのテキストファイルを一括取得する（コードインデックス用）。
   * tarball を 1 リクエストで取得して展開する。blob 毎の API 呼び出しは
   * Workers の subrequest 上限（無料プラン 50/呼び出し）を食い潰すため使わない。
   * バイナリ拡張子・100KB 超・NUL を含むファイルはスキップ。
   */
  async getRepoFiles(maxFiles = 300, ref?: string): Promise<Array<{ path: string; content: string }>> {
    const res = await fetch(`${this.base}/tarball/${ref ? encodeURIComponent(ref) : ""}`, {
      headers: this.ghHeaders(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) {
      throw new Error(`GitHub API GET /tarball -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    // ponytail: tarball 全体をメモリ展開（Workers メモリ上限 128MB が天井）。巨大リポジトリで溢れる場合はストリーミング解析へ
    const tar = new Uint8Array(
      await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
    );

    const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|zip|gz|tar|pdf|mp[34]|wasm|lock)$/i;
    const decoder = new TextDecoder();
    const NUL = String.fromCharCode(0);
    const cstr = (bytes: Uint8Array): string => decoder.decode(bytes).split(NUL)[0];

    const files: Array<{ path: string; content: string }> = [];
    let paxPath: string | undefined;
    let off = 0;
    while (off + 512 <= tar.length && files.length < maxFiles) {
      const header = tar.subarray(off, off + 512);
      if (header.every((b) => b === 0)) break; // アーカイブ終端
      const size = parseInt(cstr(header.subarray(124, 136)).trim(), 8) || 0;
      const type = String.fromCharCode(header[156]);
      const data = tar.subarray(off + 512, Math.min(off + 512 + size, tar.length));
      const name = cstr(header.subarray(0, 100));
      const prefix = cstr(header.subarray(345, 500));
      off += 512 + Math.ceil(size / 512) * 512;

      if (type === "x") {
        // pax 拡張ヘッダー（"NN path=<long path>\n"）: 次の通常エントリのパスを上書き
        paxPath = decoder.decode(data).match(/\d+ path=([^\n]+)\n/)?.[1];
        continue;
      }
      const fullName = paxPath ?? (prefix ? `${prefix}/${name}` : name);
      paxPath = undefined;
      if (type !== "0" && type !== NUL) continue; // 通常ファイル以外（ディレクトリ等）
      // tarball 先頭の "owner-repo-<sha>/" ディレクトリを剥がす
      const path = fullName.replace(/^[^/]+\//, "");
      if (!path || SKIP_EXT.test(path) || size > 100_000) continue;
      {
        const content = decoder.decode(data);
        // バイナリ判定: NUL を含むものは除外
        if (content.includes("\u0000")) continue;
        files.push({ path, content });
      }
    }
    return files;
  }

  async createPR(opts: CreatePROptions): Promise<VcsPullRequest> {
    const title = opts.title.length > 255 ? opts.title.slice(0, 252) + "..." : opts.title;
    const pr = await this.api<{ number: number; html_url: string; title: string }>(`/pulls`, {
      method: "POST",
      body: JSON.stringify({ title, body: opts.body, head: opts.branch, base: opts.baseBranch }),
    });
    if (opts.labels?.length) {
      try {
        await this.api(`/issues/${pr.number}/labels`, {
          method: "POST",
          body: JSON.stringify({ labels: opts.labels }),
        });
      } catch {
        // labels may not exist yet; non-fatal
      }
    }
    return { number: pr.number, url: pr.html_url, branch: opts.branch, title: pr.title };
  }

  async listOpenPRs(branchPrefix: string): Promise<VcsOpenPR[]> {
    const prs = await this.api<Array<{ number: number; title: string; head: { ref: string } }>>(
      `/pulls?state=open&per_page=100`
    );
    return prs
      .filter((p) => p.head.ref.startsWith(branchPrefix))
      .map((p) => ({ number: p.number, branch: p.head.ref, title: p.title }));
  }

  async getPRChecks(prNumber: number): Promise<CheckStatus> {
    const pr = await this.api<{ head: { sha: string } }>(`/pulls/${prNumber}`);
    const checks = await this.api<{
      total_count: number;
      check_runs: Array<{ status: string; conclusion: string | null }>;
    }>(`/commits/${pr.head.sha}/check-runs`);

    const runs = checks.check_runs ?? [];
    const completed = runs.filter((r) => r.status === "completed");
    const failed = completed.some((r) => r.conclusion && !["success", "neutral", "skipped"].includes(r.conclusion));
    const state: CheckStatus["state"] = failed
      ? "failure"
      : completed.length < runs.length
        ? "pending"
        : "success";
    return { state, total: runs.length, completed: completed.length };
  }

  async listPRFiles(prNumber: number): Promise<VcsPRFile[]> {
    const files = await this.api<Array<{ filename: string; patch?: string; additions: number; deletions: number }>>(
      `/pulls/${prNumber}/files?per_page=100`
    );
    return files.map((f) => ({ filename: f.filename, patch: f.patch, additions: f.additions, deletions: f.deletions }));
  }

  async mergePR(prNumber: number, method: "merge" | "squash" | "rebase" = "squash"): Promise<boolean> {
    try {
      await this.api(`/pulls/${prNumber}/merge`, {
        method: "PUT",
        body: JSON.stringify({ merge_method: method }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async deleteBranch(branch: string): Promise<void> {
    try {
      await this.api(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: "DELETE" });
    } catch {
      // branch may already be gone
    }
  }

  async createIssue(opts: CreateIssueOptions): Promise<number> {
    const issue = await this.api<{ number: number }>(`/issues`, {
      method: "POST",
      body: JSON.stringify({
        title: opts.title,
        body: opts.body,
        labels: opts.labels ?? [],
        assignees: opts.assignees ?? [],
      }),
    });
    return issue.number;
  }

  async listIssues(labels: string[], state: "open" | "closed" | "all" = "open"): Promise<VcsIssue[]> {
    const q = `?state=${state}&labels=${encodeURIComponent(labels.join(","))}&per_page=100`;
    const issues = await this.api<
      Array<{ number: number; title: string; body: string | null; state: string; labels: Array<{ name: string }>; pull_request?: unknown }>
    >(`/issues${q}`);
    return issues
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? "",
        labels: i.labels.map((l) => l.name),
        state: i.state === "closed" ? "closed" : "open",
      }));
  }

  async updateIssue(number: number, patch: { state?: "open" | "closed"; body?: string }): Promise<void> {
    await this.api(`/issues/${number}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async listRepos(): Promise<VcsRepo[]> {
    type GhRepo = {
      full_name: string; name: string; owner: { login: string };
      private: boolean; description: string | null; default_branch: string;
    };
    const results: VcsRepo[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.apiRoot<GhRepo[]>(
        `/user/repos?type=all&sort=updated&per_page=50&page=${page}`
      );
      for (const r of batch) {
        results.push({
          fullName: r.full_name,
          name: r.name,
          owner: r.owner.login,
          private: r.private,
          description: r.description,
          defaultBranch: r.default_branch,
        });
      }
      if (batch.length < 50) break;
    }
    return results;
  }

  async listBranches(owner: string, repo: string): Promise<VcsBranch[]> {
    type GhBranch = { name: string };
    const results: VcsBranch[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.apiRoot<GhBranch[]>(
        `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`
      );
      for (const b of batch) results.push({ name: b.name });
      if (batch.length < 100) break;
    }
    return results;
  }

  // ── Git object write APIs（RepoRunner が PR ブランチ作成に使用）────────────

  async getDefaultBranch(): Promise<string> {
    const result = await this.api<{ default_branch: string }>(``);
    return result.default_branch;
  }

  async getHeadSha(ref?: string): Promise<string> {
    const branch = ref || (await this.getDefaultBranch());
    return this.getRef(branch);
  }

  /** ブランチ HEAD の commit SHA を返す。 */
  async getRef(branch: string): Promise<string> {
    const result = await this.api<{ object: { sha: string } }>(
      `/git/refs/heads/${encodeURIComponent(branch)}`
    );
    return result.object.sha;
  }

  /** commit SHA から tree SHA を取る（createTree の base_tree 用）。 */
  async getCommitTreeSha(commitSha: string): Promise<string> {
    const result = await this.api<{ tree: { sha: string } }>(`/git/commits/${commitSha}`);
    return result.tree.sha;
  }

  /** 単一ファイルの contents API 取得（RepoRunner 用）。VcsProvider の optional とは別シグネチャ。 */
  async readFileContent(
    path: string,
    ref?: string
  ): Promise<{ path: string; content: string; sha: string } | null> {
    try {
      const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
      const result = await this.api<{ content: string; sha: string; encoding: string }>(
        `/contents/${path.split("/").map(encodeURIComponent).join("/")}${q}`
      );
      if (result.encoding !== "base64") throw new Error("unexpected encoding");
      return { path, content: atob(result.content.replace(/\n/g, "")), sha: result.sha };
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("404")) return null;
      throw e;
    }
  }

  async createBlob(content: string): Promise<string> {
    const result = await this.api<{ sha: string }>(`/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "utf-8" }),
    });
    return result.sha;
  }

  async createTree(
    baseTreeSha: string,
    entries: { path: string; mode?: string; type?: "blob" | "tree"; sha: string }[]
  ): Promise<string> {
    const tree = entries.map((e) => ({
      path: e.path,
      mode: e.mode ?? "100644",
      type: e.type ?? "blob",
      sha: e.sha,
    }));
    const result = await this.api<{ sha: string }>(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree }),
    });
    return result.sha;
  }

  async createCommit(message: string, treeSha: string, parents: string[]): Promise<string> {
    const result = await this.api<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: treeSha, parents }),
    });
    return result.sha;
  }

  /**
   * 新規ブランチは POST /git/refs、既存は PATCH。
   * 旧 runner は PATCH のみで新規ブランチ作成が常に失敗していた。
   */
  async createOrUpdateRef(branch: string, sha: string): Promise<void> {
    const createRes = await fetch(`${this.base}/git/refs`, {
      method: "POST",
      headers: this.ghHeaders(true),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      signal: AbortSignal.timeout(30_000),
    });
    if (createRes.ok) return;
    // 422 = ref already exists → update
    if (createRes.status === 422) {
      await this.api(`/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        body: JSON.stringify({ sha, force: false }),
      });
      return;
    }
    throw new Error(
      `GitHub API POST /git/refs -> ${createRes.status}: ${(await createRes.text()).slice(0, 300)}`
    );
  }
}
