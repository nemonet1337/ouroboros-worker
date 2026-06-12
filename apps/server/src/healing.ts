import { runHealingCycle, HealingRunRepository } from "@ouroboros/core";
import type { ServerContext } from "./context";

function genId(): string {
  return crypto.randomUUID();
}

/**
 * Self-hosted healing trigger: records a run row, then executes the cycle
 * inline (LocalRunner). Returns immediately with the run id; the cycle runs
 * in the background.
 */
export function makeTriggerHealing(ctx: ServerContext) {
  const runs = new HealingRunRepository(ctx.ports.db);

  return async (opts: { trigger: string; userId?: string; dryRun: boolean }) => {
    const runId = genId();
    const now = Date.now();
    await runs.create({
      id: runId,
      user_id: opts.userId ?? null,
      status: "queued",
      trigger: opts.trigger,
      workflow_id: null,
      summary: null,
      created_at: now,
      updated_at: now,
    });

    // fire-and-forget; status transitions persisted to D B
    void (async () => {
      try {
        await runs.update(runId, { status: "scanning" });
        const result = await runHealingCycle(ctx.ports, ctx.config, ctx.logger, {
          dryRun: opts.dryRun,
          maxPRs: ctx.config.scan.maxPRsPerRun,
          assignees: ctx.assignees,
          alertRecipients: ctx.alertRecipients,
        });
        await runs.update(runId, { status: "done", summary: JSON.stringify(result) });
      } catch (err) {
        await ctx.logger.error("healing cycle failed", { reason: (err as Error).message });
        await runs.update(runId, { status: "failed", summary: JSON.stringify({ error: (err as Error).message }) });
      }
    })();

    return { runId };
  };
}
