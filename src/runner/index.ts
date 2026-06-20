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
  RunnerKind,
} from "../ports/runner";
import type { AllFindings } from "../types";

export class RunnerEntrypoint implements HealingRunner, CodeRunner {
  readonly kind: RunnerKind = "local";

  async scan(): Promise<RunnerScanResult> {
    return { findings: { codeql: [], dependency: [], performance: [], secrets: [], licenses: [], detectedFrameworks: [], timestamp: new Date(), commitHash: "" } };
  }

  async applyFix(_opts: RunFixOptions): Promise<RunnerFixResult> {
    return { success: false, patches: [], validationOutput: "not implemented", iterations: 0 };
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

  async deleteFiles(_opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
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
}
