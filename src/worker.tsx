import type { MessageBatch, ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { buildApp, makeTriggerHealing } from "./app";
import { buildContextFromBindings } from "./context";
import { handleGuiEvents } from "./core/gui-events";
import { runScheduledTick } from "./cron";
import { configFromBindings, type CloudflareBindings } from "./env";
import type { GuiEvent } from "./core/events";

/**
 * Cloudflare Worker エントリポイント。
 * ルートは共有の buildApp、コンテキストは D1 + CF Queues で組み立てる。
 * Workflows は使わず、healing は Queue consumer 内で直列に実行する。
 * マイグレーションは `wrangler d1 migrations apply` が適用済みの前提
 * （0013 の ALTER TABLE は非冪等なので runMigrations() は呼ばない）。
 */

let cachedApp: Awaited<ReturnType<typeof buildApp>> | undefined;

async function getApp(env: CloudflareBindings) {
  if (!cachedApp) {
    const config = configFromBindings(env);
    const ctx = await buildContextFromBindings(env);
    // /assets/tailwind.css は static assets（run_worker_first = false）が先に配信する
    cachedApp = await buildApp(config, ctx, null);
  }
  return cachedApp;
}

export default {
  async fetch(request: Request, env: CloudflareBindings, ctx: ExecutionContext): Promise<Response> {
    try {
      const app = await getApp(env);
      return await app.fetch(request, env, ctx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker] unhandled fetch error:", msg);
      return Response.json({ error: { code: "worker_error", message: msg } }, { status: 500 });
    }
  },
  async queue(batch: MessageBatch<GuiEvent>, env: CloudflareBindings): Promise<void> {
    const wctx = await buildContextFromBindings(env);
    await handleGuiEvents(
      batch.messages.map((message) => message.body),
      wctx
    );
  },
  async scheduled(
    event: ScheduledController,
    env: CloudflareBindings,
    _ctx: ExecutionContext
  ): Promise<void> {
    const wctx = await buildContextFromBindings(env);
    // Node の cron.ts と同一の tick を共有する（stale sweep + 定期 healing）。
    await runScheduledTick(configFromBindings(env), wctx, event.scheduledTime ? new Date(event.scheduledTime) : new Date());
  },
};
