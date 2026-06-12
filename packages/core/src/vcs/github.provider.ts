import type {
  VcsProvider,
  VcsPullRequest,
  VcsOpenPR,
  VcsPRFile,
  VcsIssue,
  CreatePROptions,
  CreateIssueOptions,
  CheckStatus,
} from "../ports/vcs";

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

/**
 * Fetch-based GitHub REST client implementing the VcsProvider port.
 * No Octokit dependency, so it runs on both Node 22 and Cloudflare Workers.
 */
export class GitHubProvider implements VcsProvider {
  readonly name = "github";
  private readonly base: string;

  constructor(private readonly cfg: GitHubConfig) {
    this.base = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`;
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${this.cfg.token}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "ouroboros-self-healing",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub API ${init?.method ?? "GET"} ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
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
}
