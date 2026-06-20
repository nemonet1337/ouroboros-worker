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
} from "../ports";
import type { AllFindings } from "../types";

export class DispatchRunner implements HealingRunner, CodeRunner {
  readonly kind = "dispatch" as const;

  constructor(
    private readonly runnerUrl: string,
    private readonly secret: string
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.runnerUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-runner-secret": this.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(600_000),
    });
    if (!res.ok) {
      throw new Error(`runner ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  // ── HealingRunner ──────────────────────────────────────────────────────

  async scan(): Promise<RunnerScanResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for edge healing");
    const findings = await this.post<AllFindings>("/internal/scan", {});
    return { findings };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for edge healing");
    return this.post<RunnerFixResult>("/internal/heal", {
      group: opts.group,
      dryRun: opts.dryRun,
    });
  }

  // ── CodeRunner ─────────────────────────────────────────────────────────

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeInitResult>("/internal/code/init", opts);
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<{ branch: string; changedFiles: string[] }>("/internal/code/status", opts);
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeReadResult>("/internal/code/read", opts);
  }

  async search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeSearchResult>("/internal/code/search", opts);
  }

  async write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeWriteResult>("/internal/code/write", opts);
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<{ success: boolean }>("/internal/code/delete", opts);
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeDiffResult>("/internal/code/diff", opts);
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<CodeCommitResult>("/internal/code/commit", opts);
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    if (!this.runnerUrl) throw new Error("RUNNER_URL not configured for code mode");
    return this.post<{ success: boolean }>("/internal/code/push", opts);
  }
}
