export interface VcsPullRequest {
  number: number;
  url: string;
  branch: string;
  title: string;
}

export interface VcsOpenPR {
  number: number;
  branch: string;
  title: string;
}

export interface VcsIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
}

export interface CreatePROptions {
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface CreateIssueOptions {
  title: string;
  body: string;
  labels?: string[];
  assignees?: string[];
}

export interface VcsRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
}

/**
 * GitHub REST API for PRs, issues, and repo metadata.
 * Git object writes (blob/tree/commit/ref) live on GitHubProvider, used by RepoRunner.
 */
export interface VcsProvider {
  readonly name: string;
  createPR(opts: CreatePROptions): Promise<VcsPullRequest>;
  listOpenPRs(branchPrefix: string): Promise<VcsOpenPR[]>;
  createIssue(opts: CreateIssueOptions): Promise<number>;
  listIssues(labels: string[], state?: "open" | "closed" | "all"): Promise<VcsIssue[]>;
  updateIssue(number: number, patch: { state?: "open" | "closed"; body?: string }): Promise<void>;
  /** List repositories accessible with the configured token. */
  listRepos?(): Promise<VcsRepo[]>;
}
