import type { DynamicWorkerLoader, DynamicWorkerInstance } from "../env";
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
  CodeGenerateResult,
} from "../ports/runner";

export class DynamicRunner implements HealingRunner, CodeRunner {
  readonly kind = "rpc" as const;

  constructor(private readonly loader: DynamicWorkerLoader) {}

  private getWorker(): DynamicWorkerInstance | null {
    if (!this.loader) return null;
    return this.loader.load({
      compatibilityDate: "2024-11-01",
      mainModule: "src/code/session.ts",
      modules: {},
      globalOutbound: null,
    });
  }

  async scan(): Promise<RunnerScanResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/scan", { method: "POST", body: "{}" }));
    return (await res.json()) as RunnerScanResult;
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/heal", {
      method: "POST",
      body: JSON.stringify({ group: opts.group, dryRun: opts.dryRun }),
    }));
    return (await res.json()) as RunnerFixResult;
  }

  async init(opts: CodeInitOptions): Promise<CodeInitResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/init", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeInitResult;
  }

  async status(opts: { sessionId: string }): Promise<{ branch: string; changedFiles: string[] }> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/status", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as { branch: string; changedFiles: string[] };
  }

  async read(opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/read", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeReadResult;
  }

  async search(opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/search", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeSearchResult;
  }

  async write(opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/write", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeWriteResult;
  }

  async deleteFiles(opts: { sessionId: string; paths: string[] }): Promise<{ success: boolean }> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/delete", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as { success: boolean };
  }

  async diff(opts: { sessionId: string }): Promise<CodeDiffResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/diff", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeDiffResult;
  }

  async commit(opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/commit", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeCommitResult;
  }

  async push(opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/push", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as { success: boolean };
  }

  async generate(opts: { sessionId: string; instruction: string; model?: string }): Promise<CodeGenerateResult> {
    const worker = this.getWorker();
    if (!worker) throw new Error("Dynamic worker not configured");
    const res = await worker.fetch(new Request("http://internal/code/generate", {
      method: "POST",
      body: JSON.stringify(opts),
    }));
    return (await res.json()) as CodeGenerateResult;
  }
}