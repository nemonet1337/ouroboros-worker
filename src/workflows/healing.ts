import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { HealingRunRepository } from "../db/repositories";
import type { AllFindings } from "../types";
import type { Env } from "../env";
import { buildContext } from "../context";
import { inspectHealingRun, scanHealingRun } from "../healing/analyze";
import { fixHealingRun } from "../healing/fix";
import { mergeHealingSummary } from "../healing/summary";

export interface HealingParams {
  runId: string;
  dryRun: boolean;
  trigger: string;
  phase: "analyze" | "fix";
  autoFix?: boolean;
  instruction?: string;
}

const STEP_OPTS_SCAN = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "10 minutes" as const,
};
const STEP_OPTS_ANALYZE = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "10 minutes" as const,
};
const STEP_OPTS_FIX = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "15 minutes" as const,
};

/**
 * AI Gateway の 2021（クレジット不足）や 401/403 は再試行しても直らない。
 * step のリトライに食わせると 1 invocation の subrequest 予算を 3 回分使い切り、
 * 最後に「Too many subrequests」しか残らない（原因が隠れる）ので、
 * 恒久エラーはステップ内で握り潰して run を failed にして正常終了させる。
 */
const PERMANENT_ERROR = /\b2021\b|insufficient\b.*\bcredits?\b|\b401\b|\b403\b/i;

function isPermanentError(err: unknown): boolean {
  return PERMANENT_ERROR.test(err instanceof Error ? err.message : String(err));
}

/**
 * Durable self-healing lifecycle.
 * GUI: analyze で止まり、修復確認後に phase=fix。
 * cron: autoFix で解析の直後に修復まで進む。
 */
export class HealingWorkflow extends WorkflowEntrypoint<Env, HealingParams> {
  async run(event: WorkflowEvent<HealingParams>, step: WorkflowStep): Promise<void> {
    const { runId } = event.payload;
    try {
      await this.execute(event, step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status !== "canceled") {
        await runs.update(runId, {
          status: "failed",
          summary: mergeHealingSummary(current?.summary, { error: message }),
        });
      }
      console.error(`[workflow] failed runId=${runId}`, message);
      throw err;
    }
  }

  /**
   * 恒久エラーなら run を failed にして true を返す（呼び出し側は throw せず
   * ステップを正常終了させる）。一時エラーなら false を返して再試行に任せる。
   */
  private async failPermanent(runId: string, err: unknown): Promise<boolean> {
    if (!isPermanentError(err)) return false;
    const message = err instanceof Error ? err.message : String(err);
    const ctx = await buildContext(this.env);
    const runs = new HealingRunRepository(ctx.ports.db);
    const current = await runs.find(runId);
    if (current?.status !== "canceled") {
      await runs.update(runId, {
        status: "failed",
        summary: mergeHealingSummary(current?.summary, { error: message }),
      });
    }
    console.error(`[workflow] permanent failure runId=${runId}`, message);
    return true;
  }

  private async execute(
    event: WorkflowEvent<HealingParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { runId, dryRun, phase, autoFix, instruction } = event.payload;
    const bindWorkflow = async () => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      await runs.update(runId, { workflow_id: event.instanceId });
    };
    await bindWorkflow();

    if (phase !== "fix") {
      const findings = await step.do(
        "scan",
        STEP_OPTS_SCAN,
        async (): Promise<AllFindings | null> => {
          const ctx = await buildContext(this.env);
          try {
            return await scanHealingRun(ctx, runId);
          } catch (err) {
            if (await this.failPermanent(runId, err)) return null;
            throw err;
          }
        }
      );
      if (!findings) return;

      const analyzed = await step.do(
        "analyze",
        STEP_OPTS_ANALYZE,
        async (): Promise<boolean> => {
          const ctx = await buildContext(this.env);
          try {
            await inspectHealingRun(ctx, runId, findings, instruction);
            return true;
          } catch (err) {
            if (await this.failPermanent(runId, err)) return false;
            throw err;
          }
        }
      );
      if (!analyzed) return;
    }

    if (phase === "fix" || autoFix) {
      await step.do("fix", STEP_OPTS_FIX, async () => {
        const ctx = await buildContext(this.env);
        return fixHealingRun(ctx, runId, dryRun);
      });
    }
  }
}
