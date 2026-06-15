import type { HealingRunner, RunFixOptions, RunnerFixResult, RunnerScanResult } from "../ports";
import type { AllFindings } from "../types";

/**
 * Edge healing runner: the Worker cannot run git/compilers, so the heavy work
 * (scan, patch+validate+commit+push) is dispatched over HTTP to a self-hosted
 * LocalRunner exposed at RUNNER_URL/internal/*, authenticated by a shared secret.
 */
export class DispatchRunner implements HealingRunner {
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
}
