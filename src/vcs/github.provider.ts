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
   * git/trees の recursive 取得後、バイナリ拡張子と 100KB 超のファイルをスキップ。
   */
  async getRepoFiles(maxFiles = 300, ref?: string): Promise<Array<{ path: string; content: string }>> {
    const branch = ref ?? (await this.api<{ default_branch: string }>(``)).default_branch;
    const tree = await this.api<{ tree: Array<{ path: string; type: string; size?: number; sha: string }> }>(
      `/git/trees/${encodeURIComponent(branch)}?recursive=1`
    );

    const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|zip|gz|tar|pdf|mp[34]|wasm|lock)$/i;
    const blobs = tree.tree
      .filter((e) => e.type === "blob" && !SKIP_EXT.test(e.path) && (e.size ?? 0) <= 100_000)
      .slice(0, maxFiles);

    const files: Array<{ path: string; content: string }> = [];
    for (const entry of blobs) {
      try {
        const blob = await this.api<{ content: string; encoding: string }>(`/git/blobs/${entry.sha}`);
        if (blob.encoding !== "base64") continue;
        const content = atob(blob.content.replace(/\n/g, ""));
        // バイナリ判定: NUL を含むものは除外
        if (content.includes("\u0000")) continue;
        files.push({ path: entry.path, content });
      } catch {
        // 単一ファイルの取得失敗は無視して続行
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
}
