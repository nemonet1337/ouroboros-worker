import {
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
  InspectionRepository,
} from "./db/repositories";
import type { WorkerContext } from "./context";
import { makeTriggerHealing } from "./app";
import type { AppConfig } from "./env";

/**
 * app_settings.schedule.time（"HH:MM" UTC）の時（HH）が現在の UTC 時と一致するか判定する。
 */
export async function shouldRunScheduledHealing(wctx: WorkerContext, now: Date): Promise<boolean> {
  const raw = await new SettingsRepository(wctx.ports.db).get("app_settings").catch(() => undefined);
  if (!raw) return false;
  let time = "";
  let daysOfWeek: number[] | undefined;
  try {
    const parsed = JSON.parse(raw) as { schedule?: { time?: string; daysOfWeek?: number[] } };
    time = typeof parsed.schedule?.time === "string" ? parsed.schedule.time : "";
    daysOfWeek = Array.isArray(parsed.schedule?.daysOfWeek) ? parsed.schedule!.daysOfWeek : undefined;
  } catch {
    return false;
  }
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return false;
  if (now.getUTCHours() !== hour) return false;
  if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(now.getUTCDay())) return false;
  return true;
}

/**
 * Node 版 cron。1 時間ごとに stale sweep と定期 healing を行う。
 * 旧 `scheduled` ハンドラの等価。Node では setInterval で回す。
 * `now` は Cloudflare の scheduled 発火時刻を渡せる（省略時は現在時刻）。
 */
export async function runScheduledTick(
  config: AppConfig,
  ctx: WorkerContext,
  now: Date = new Date()
): Promise<void> {
  await ctx.auth.cleanupExpiredSessions();

  // スタック検出: 長時間進行中のままのジョブを failed にする
  const inspections = new InspectionRepository(ctx.ports.db);
  const runs = new HealingRunRepository(ctx.ports.db);
  const sessions = new CodeSessionRepository(ctx.ports.db);
  const nInsp = await inspections.failStale(30 * 60 * 1000);
  const nHeal = await runs.failStale(60 * 60 * 1000);
  const nCode = await sessions.failStale(10 * 60 * 1000);
  if (nInsp || nHeal || nCode) {
    console.log(`[cron] stale sweep: inspections=${nInsp} healing=${nHeal} code=${nCode}`);
  }

  if (await shouldRunScheduledHealing(ctx, new Date())) {
    const trigger = makeTriggerHealing(config, ctx);
    await trigger({ trigger: "cron", dryRun: false, autoFix: true, phase: "analyze" });
  }
}
