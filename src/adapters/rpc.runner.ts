import type { HealingRunner, RunFixOptions, RunnerFixResult, RunnerScanResult, RunnerKind, CodeRunner, CodeInitOptions, CodeInitResult, CodeCommitResult, CodeDiffResult, CodeReadResult, CodeSearchResult, CodeWriteResult, CodeGenerateResult } from "../ports/runner";
import { normalizeAllFindings } from "../utils/findings.normalize";

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
    const raw = await this.post<unknown>("/internal/scan", {});
    return { findings: normalizeAllFindings(raw) };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    return this.post<RunnerFixResult>("/internal/heal", {
      group: opts.group,
      dryRun: opts.dryRun,
      baseBranch: opts.baseBranch,
      branchPrefix: opts.branchPrefix,
    });
  }

  // ── CodeRunner ─────────────────────────────────────────────────────────

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    return this.post<CodeInitResult>("/internal/code/init", opts);
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    return this.post<{ branch: string; changedFiles: string[] }>("/internal/code/status", opts);
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    return this.post<CodeReadResult>("/internal/code/read", opts);
  }

  async search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    return this.post<CodeSearchResult>("/internal/code/search", opts);
  }

  async write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    return this.post<CodeWriteResult>("/internal/code/write", opts);
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>("/internal/code/delete", opts);
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    return this.post<CodeDiffResult>("/internal/code/diff", opts);
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    return this.post<CodeCommitResult>("/internal/code/commit", opts);
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>("/internal/code/push", opts);
  }

  async generate(opts: { sessionId: string; instruction: string; model?: string }): Promise<CodeGenerateResult> {
    return this.post<CodeGenerateResult>("/internal/code/generate", opts);
  }
}
