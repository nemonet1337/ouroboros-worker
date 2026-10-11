import type { AllFindings, FindingGroup, HarnessTrace, Patch } from "../types";
import type { ReasoningEffort, RoutingConfig } from "../config/routing";
import type { RouteDecision } from "../ai/router";

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
  /** healing モードで解決したモデル ID（provider/model） */
  model?: string;
  /** 指摘行の前後に送る行数。未指定ならファイル先頭 8k 文字。 */
  contextLines?: number;
  /** 難易度判定の設定（ローカル Laya のファイル選択に使う）。 */
  routing?: RoutingConfig;
}

export interface HealingRunner {
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
  /** 生成失敗時の理由（JSON パース失敗等）。成功時は undefined */
  error?: string;
  trace?: HarnessTrace;
  /** 難易度判定で決めたモデル階層。判定できなかった場合は undefined。 */
  route?: RouteDecision;
}
export interface CodeGenerateOptions {
  sessionId: string;
  instruction: string;
  /** 明示指定されたモデル。難易度判定より優先される。 */
  model?: string;
  reasoningEffort?: ReasoningEffort;
  /** 難易度判定によるモデル階層選択に使う設定。 */
  routing?: RoutingConfig;
  /** true なら判定を呼ばず model / routing の既定をそのまま使う。 */
  modelOverride?: boolean;
}

export interface CodeRunner {
  init(opts: CodeInitOptions): Promise<CodeInitResult>;
  read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult>;
  search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult>;
  write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult>;
  commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult>;
  push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }>;
  generate(opts: CodeGenerateOptions): Promise<CodeGenerateResult>;
}

