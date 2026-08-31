import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { HealingRunRepository } from "../db/repositories";
import type { AllFindings } from "../types";
import type { Env } from "../env";
import { buildContext } from "../context";
import { indexHealingRun, inspectHealingRun, scanHealingRun } from "../healing/analyze";
import { fixHealingRun } from "../healing/fix";
import { mergeHealingSummary } from "../healing/summary";

export interface HealingParams {
  runId: string;
  dryRun: boolean;
  trigger: string;
  phase: "analyze" | "fix";
  autoFix?: boolean;
}

const STEP_OPTS_INDEX = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "10 minutes" as const,
};
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

  private async execute(
    event: WorkflowEvent<HealingParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { runId, dryRun, phase, autoFix } = event.payload;
    const bindWorkflow = async () => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      await runs.update(runId, { workflow_id: event.instanceId });
    };
    await bindWorkflow();

    if (phase !== "fix") {
      await step.do("index", STEP_OPTS_INDEX, async () => {
        const ctx = await buildContext(this.env);
        return indexHealingRun(ctx, runId);
      });

      const findings = await step.do("scan", STEP_OPTS_SCAN, async (): Promise<AllFindings> => {
        const ctx = await buildContext(this.env);
        return scanHealingRun(ctx, runId);
      });

      await step.do("analyze", STEP_OPTS_ANALYZE, async () => {
        const ctx = await buildContext(this.env);
        return inspectHealingRun(ctx, runId, findings);
      });
    }

    if (phase === "fix" || autoFix) {
      await step.do("fix", STEP_OPTS_FIX, async () => {
        const ctx = await buildContext(this.env);
        return fixHealingRun(ctx, runId, dryRun);
      });
    }
  }
}
