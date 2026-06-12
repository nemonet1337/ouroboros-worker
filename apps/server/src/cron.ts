import type { ServerContext } from "./context";

/**
 * Minimal interval scheduler replacing the GitHub Actions cron. Runs a healing
 * cycle every OURO_HEAL_INTERVAL_HOURS (default 24h). Set to 0 to disable.
 */
export function startCron(ctx: ServerContext, trigger: () => Promise<unknown>): void {
  const hours = Number(process.env.OURO_HEAL_INTERVAL_HOURS ?? "24");
  if (!hours || hours <= 0) {
    ctx.logger.info("cron disabled (OURO_HEAL_INTERVAL_HOURS=0)");
    return;
  }
  const intervalMs = hours * 60 * 60 * 1000;
  ctx.logger.info(`cron enabled: healing every ${hours}h`);
  setInterval(() => {
    ctx.logger.info("cron tick: triggering healing");
    void trigger().catch((err) => ctx.logger.error("cron healing failed", { reason: (err as Error).message }));
  }, intervalMs);
}
