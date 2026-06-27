import type { AllFindings, FindingGroup, Patch } from "../types";

export type RunnerKind = "local" | "dispatch" | "rpc" | "noop";

export interface RunnerScanResult {
  findings: AllFindings;
}

export interface RunnerFixResult {
  success: boolean;
  patches: Patch[];
  branch?: string;
  validationOutput: string;
  iterations: number;
}

export interface RunFixOptions {
  group: FindingGroup;
  baseBranch: string;
  branchPrefix: string;
  dryRun: boolean;
}

export interface HealingRunner {
  readonly kind: RunnerKind;
  scan(): Promise<RunnerScanResult>;
  applyFix(opts: RunFixOptions): Promise<RunnerFixResult>;
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

export interface CodeInitOptions {
  repoUrl: string;
  branch: string;
  sessionId: string;
}

export interface CodeGenerateResult {
  patches: Patch[];
  model: string;
}

export interface CodeRunner {
  readonly kind: RunnerKind;
  init(opts: CodeInitOptions): Promise<CodeInitResult>;
  status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }>;
  read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult>;
  search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult>;
  write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult>;
  deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }>;
  diff(opts: { sessionId: string }): Promise<CodeDiffResult>;
  commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult>;
  push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }>;
  generate(opts: { sessionId: string; instruction: string; model?: string }): Promise<CodeGenerateResult>;
}

export class NoopRunner implements HealingRunner, CodeRunner {
  readonly kind: RunnerKind = "noop";

  async scan(): Promise<RunnerScanResult> {
    return {
      findings: {
        codeql: [],
        dependency: [],
        performance: [],
        secrets: [],
        licenses: [],
        detectedFrameworks: [],
        timestamp: new Date(),
        commitHash: "",
      },
    };
  }

  async applyFix(_opts: RunFixOptions): Promise<RunnerFixResult> {
    return {
      success: false,
      patches: [],
      validationOutput: "no runner configured",
      iterations: 0,
    };
  }

  async init(_opts: CodeInitOptions): Promise<CodeInitResult> {
    return { success: false, repoPath: "", fileList: [] };
  }

  async status(_opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    return { branch: "", changedFiles: [] };
  }

  async read(_opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    return { files: [] };
  }

  async search(_opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    return { results: [] };
  }

  async write(_opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    return { success: false, files: [] };
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    return { success: false };
  }

  async diff(_opts: { sessionId: string }): Promise<CodeDiffResult> {
    return { diffs: [] };
  }

  async commit(_opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    return { success: false, commitHash: "" };
  }

  async push(_opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    return { success: false };
  }

  async generate(_opts: { sessionId: string; instruction: string; model?: string }): Promise<CodeGenerateResult> {
    return { patches: [], model: "" };
  }
}
