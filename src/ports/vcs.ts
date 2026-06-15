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

export interface VcsPRFile {
  filename: string;
  patch?: string;
  additions: number;
  deletions: number;
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

export interface CheckStatus {
  state: "pending" | "success" | "failure";
  total: number;
  completed: number;
}

export interface VcsRepo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
}

export interface VcsBranch {
  name: string;
}

/**
 * Abstraction over a version-control hosting provider (GitHub today;
 * GitLab/Gitea can be added later). API-only operations — local git
 * commit/push lives in the HealingRunner, not here.
 */
export interface VcsProvider {
  readonly name: string;
  createPR(opts: CreatePROptions): Promise<VcsPullRequest>;
  listOpenPRs(branchPrefix: string): Promise<VcsOpenPR[]>;
  getPRChecks(prNumber: number): Promise<CheckStatus>;
  listPRFiles(prNumber: number): Promise<VcsPRFile[]>;
  mergePR(prNumber: number, method?: "merge" | "squash" | "rebase"): Promise<boolean>;
  deleteBranch(branch: string): Promise<void>;
  createIssue(opts: CreateIssueOptions): Promise<number>;
  listIssues(labels: string[], state?: "open" | "closed" | "all"): Promise<VcsIssue[]>;
  updateIssue(number: number, patch: { state?: "open" | "closed"; body?: string }): Promise<void>;
  /** List repositories accessible with the configured token. */
  listRepos?(): Promise<VcsRepo[]>;
  /** List branches for a given owner/repo pair. */
  listBranches?(owner: string, repo: string): Promise<VcsBranch[]>;
}
