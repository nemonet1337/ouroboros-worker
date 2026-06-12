import type { AllFindings, FindingGroup, Patch } from "../types";

export interface RunnerScanResult {
  findings: AllFindings;
}

export interface RunnerFixResult {
  success: boolean;
  patches: Patch[];
  /** Branch the runner committed + pushed the fix to (omitted on dry-run/failure). */
  branch?: string;
  validationOutput: string;
  iterations: number;
}

export interface RunFixOptions {
  group: FindingGroup;
  baseBranch: string;
  branchPrefix: string;
  /** When true, generate + validate patches but do NOT commit/push. */
  dryRun: boolean;
}

/**
 * Performs the filesystem/git/compiler-heavy parts of self-healing.
 * Implementations: LocalRunner (in-process, Node — runs scanners, AIFixer,
 * git), DispatchRunner (Cloudflare — HTTP POST to a remote LocalRunner).
 */
export interface HealingRunner {
  readonly kind: "local" | "dispatch";
  scan(): Promise<RunnerScanResult>;
  applyFix(opts: RunFixOptions): Promise<RunnerFixResult>;
}
