import { Hono } from "hono";
import { mountApi } from "./http/api";
import { runMigrations } from "./db";
import { HealingRunRepository } from "./db/repositories";
import type { GuiEvent } from "./ports/queue";
import type { Env } from "./env";
import { buildContext } from "./context";
import { handleGuiEvents } from "./queues/gui-events";

export { HealingWorkflow } from "./workflows/healing";

let migrated = false;
let cachedApp: ReturnType<typeof buildApp> | undefined;

async function ensureMigrated(env: Env): Promise<void> {
  if (migrated) return;
  const { D1Adapter } = await import("./adapters/d1.adapter");
  await runMigrations(new D1Adapter(env.DB));
  migrated = true;
}

/** Worker healing trigger: persist a run, enqueue a GUI event; the consumer starts the Workflow. */
function makeTriggerHealing(env: Env, ctx: ReturnType<typeof buildContext>) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (opts: { trigger: string; userId?: string; dryRun: boolean }) => {
    const runId = crypto.randomUUID();
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
    const event: GuiEvent = {
      id: crypto.randomUUID(),
      type: "healing.requested",
      userId: opts.userId,
      payload: { runId, dryRun: opts.dryRun, trigger: opts.trigger },
      enqueuedAt: now,
    };
    await ctx.ports.queue.send(event);
    return { runId };
  };
}

function buildApp(env: Env): Hono {
  const ctx = buildContext(env);
  const triggerHealing = makeTriggerHealing(env, ctx);
  const app = new Hono();

  app.use("*", async (c, next) => {
    await ensureMigrated(env);
    await next();
  });

  // Mounted at /api/v1 (canonical) and /api (compat alias).
  mountApi(app, { ...ctx, triggerHealing, cookieSecure: true });

  // Serve the built Nuxt GUI from the ASSETS binding; SPA fallback to index.html.
  app.get("/*", async (c) => {
    const res = await env.ASSETS.fetch(c.req.raw);
    if (res.status !== 404) return res;
    const url = new URL(c.req.url);
    url.pathname = "/";
    return env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
  });

  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      cachedApp ??= buildApp(env);
      return await cachedApp.fetch(request, env, ctx);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[worker] unhandled fetch error:", msg);
      return Response.json({ error: { code: "worker_error", message: msg } }, { status: 500 });
    }
  },

  async queue(batch: MessageBatch<GuiEvent>, env: Env): Promise<void> {
    await ensureMigrated(env);
    await handleGuiEvents(batch, env);
  },

  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await ensureMigrated(env);
    const wctx = buildContext(env);
    await wctx.auth.cleanupExpiredSessions();
    const trigger = makeTriggerHealing(env, wctx);
    await trigger({ trigger: "cron", dryRun: false });
  },
};
