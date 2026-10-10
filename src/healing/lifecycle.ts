import { HealingRunRepository } from "../db/repositories";
import type { AllFindings } from "../types";
import { buildContext, type WorkerContext } from "../context";
import { inspectHealingRun, scanHealingRun } from "../healing/analyze";
import { fixHealingRun } from "../healing/fix";
import { mergeHealingSummary } from "../healing/summary";
import { randomUUID } from "node:crypto";

export interface HealingParams {
  runId: string;
  dryRun: boolean;
  trigger: string;
  phase: "analyze" | "fix";
  autoFix?: boolean;
  instruction?: string;
}

/**
 * AI ゲートウェイの 2021（クレジット不足）や 401/403 は再試行しても直らない。
 */
const PERMANENT_ERROR = /\b2021\b|insufficient\b.*\bcredits?\b|\b401\b|\b403\b/i;

function isPermanentError(err: unknown): boolean {
  return PERMANENT_ERROR.test(err instanceof Error ? err.message : String(err));
}

function isCanceled(err: unknown): boolean {
  return /canceled|cancelled/i.test(err instanceof Error ? err.message : String(err));
}

export interface HealingLifecycleOptions {
  params: HealingParams;
  ctx: WorkerContext;
  /** cancel 用。各ステップ前に abort されたかを見る。 */
  signal?: AbortSignal;
}

/**
 * プロセス内直列オーケストレーション（Workflow 非依存）。
 * scan / analyze / fix を順に実行し、各ステップの前に cancel を確認する。
 */
export class HealingLifecycle {
  #runs: HealingRunRepository;

  constructor(private readonly opts: HealingLifecycleOptions) {
    this.#runs = new HealingRunRepository(opts.ctx.ports.db);
  }

  async run(): Promise<void> {
    const { runId } = this.opts.params;
    const ctx = this.opts.ctx;
    try {
      await this.#runs.update(runId, { workflow_id: `job_${randomUUID()}` });
      await this.#execute(ctx);
    } catch (err) {
      if (isCanceled(err) || isPermanentError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        const current = await this.#runs.find(runId);
        if (current?.status !== "canceled") {
          await this.#runs.update(runId, {
            status: "failed",
            summary: mergeHealingSummary(current?.summary, { error: message }),
          });
        }
        console.error(`[lifecycle] permanent failure runId=${runId}`, message);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const current = await this.#runs.find(runId);
      if (current?.status !== "canceled") {
        await this.#runs.update(runId, {
          status: "failed",
          summary: mergeHealingSummary(current?.summary, { error: message }),
        });
      }
      console.error(`[lifecycle] failed runId=${runId}`, message);
    }
  }

  async #execute(ctx: WorkerContext): Promise<void> {
    const { runId, dryRun, phase, autoFix, instruction } = this.opts.params;
    let findings: AllFindings | null = null;

    if (phase !== "fix") {
      this.#throwIfCanceled();
      try {
        findings = await scanHealingRun(ctx, runId);
      } catch (err) {
        if (isPermanentError(err)) throw err;
        throw err;
      }
      if (!findings) return;

      this.#throwIfCanceled();
      await inspectHealingRun(ctx, runId, findings, instruction);
    }

    if (phase === "fix" || autoFix) {
      this.#throwIfCanceled();
      await fixHealingRun(ctx, runId, dryRun);
    }
  }

  async #throwIfCanceled(): Promise<void> {
    if (this.opts.signal?.aborted) throw new Error("canceled");
    const run = await this.#runs.find(this.opts.params.runId);
    if (run?.status === "canceled") throw new Error("canceled");
  }
}

/** GUI / cron の入口。context を組み立てて lifecycle を回す。 */
export async function runHealingLifecycle(params: HealingParams, ctx: WorkerContext): Promise<void> {
  await new HealingLifecycle({ params, ctx }).run();
}
