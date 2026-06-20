import type { HealingRunner, RunFixOptions, RunnerFixResult, RunnerScanResult, RunnerKind, CodeRunner, CodeInitOptions, CodeInitResult, CodeCommitResult, CodeDiffResult, CodeReadResult, CodeSearchResult, CodeWriteResult } from "../ports/runner";
import type { AllFindings } from "../types";

export class RpcRunner implements HealingRunner, CodeRunner {
  readonly kind: RunnerKind = "rpc";

  constructor(private readonly runner: { fetch(req: Request): Promise<Response> }) {}

  private async post<T>(path: string, body: any): Promise<T> {
    const res = await this.runner.fetch(
      new Request(`http://internal${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`runner ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  // ── HealingRunner ──────────────────────────────────────────────────────

  async scan(): Promise<RunnerScanResult> {
    const findings = await this.post<AllFindings>("/scan", {});
    return { findings };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    return this.post<RunnerFixResult>("/heal", {
      group: opts.group,
      dryRun: opts.dryRun,
      baseBranch: opts.baseBranch,
      branchPrefix: opts.branchPrefix,
    });
  }

  // ── CodeRunner ─────────────────────────────────────────────────────────

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    return this.post<CodeInitResult>("/code/init", opts);
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    return this.post<{ branch: string; changedFiles: string[] }>("/code/status", opts);
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    return this.post<CodeReadResult>("/code/read", opts);
  }

  async search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    return this.post<CodeSearchResult>("/code/search", opts);
  }

  async write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    return this.post<CodeWriteResult>("/code/write", opts);
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>("/code/delete", opts);
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    return this.post<CodeDiffResult>("/code/diff", opts);
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    return this.post<CodeCommitResult>("/code/commit", opts);
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>("/code/push", opts);
  }
}
