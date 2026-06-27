export {};

export interface Env {
  DB: D1Database;
  GITHUB_TOKEN_SECRET: { get(): Promise<string> };
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  AI?: Ai;
  GITHUB_REPOSITORY?: string;
  RUNNER_SHARED_SECRET?: string;
  OURO_CODE_MODEL?: string;
}

export interface AllFindings {
  codeql: any[];
  dependency: any[];
  performance: any[];
  secrets: any[];
  licenses: any[];
  detectedFrameworks: string[];
  timestamp: Date;
  commitHash: string;
}

export interface FindingGroup {
  id: string;
  priority: string;
  findings: any[];
  autoFixable: boolean;
  estimatedRisk: string;
  fixStrategy: { title: string; steps: string[]; rationale: string };
}

export interface RunFixOptions {
  group: FindingGroup;
  dryRun: boolean;
  baseBranch?: string;
  branchPrefix?: string;
}

export interface RunnerFixResult {
  success: boolean;
  patches: any[];
  branch?: string;
  validationOutput: string;
  iterations: number;
}

export interface RunnerScanResult {
  findings: AllFindings;
}

export interface CodeInitOptions {
  sessionId: string;
  repoUrl: string;
  branch: string;
}

export interface CodeInitResult {
  success: boolean;
  repoPath: string;
  fileList: string[];
}

export interface CodeReadResult {
  files: { path: string; content: string }[];
}

export interface CodeSearchResult {
  results: { file: string; line: number; content: string }[];
}

export interface CodeWriteResult {
  success: boolean;
  files: string[];
}

export interface CodeDiffResult {
  diffs: { path: string; diff: string }[];
}

export interface CodeCommitResult {
  success: boolean;
  commitHash: string;
}

export interface Patch {
  file: string;
  originalContent: string;
  fixedContent: string;
  diff: string;
  explanation: string;
}

export interface CodeGenerateOptions {
  sessionId: string;
  instruction: string;
  model?: string;
}

export interface CodeGenerateResult {
  patches: Patch[];
  model: string;
}

declare module "cloudflare:workers" {
  interface WorkerEntrypoint {
    // Healing
    scan(repoUrl?: string, branch?: string): Promise<AllFindings>;
    applyFix(opts: RunFixOptions): Promise<RunnerFixResult>;
    // Code Mode
    codeInit(opts: CodeInitOptions): Promise<CodeInitResult>;
    codeStatus(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }>;
    codeRead(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult>;
    codeSearch(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult>;
    codeWrite(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult>;
    codeDelete(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }>;
    codeDiff(opts: { sessionId: string }): Promise<CodeDiffResult>;
    codeCommit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult>;
    codePush(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }>;
    codeGenerate(opts: CodeGenerateOptions): Promise<CodeGenerateResult>;
  }
}
