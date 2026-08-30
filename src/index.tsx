/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx } from "hono/jsx";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { mountApi } from "./http/api";
import { runMigrations } from "./db";
import {
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
  InspectionRepository,
} from "./db/repositories";
import { DEFAULT_WORKERS_AI_MODEL } from "./config/deployment";
import {
  areWebhooksEnabled,
  getFeatureFlags,
  DEFAULT_APP_SETTINGS,
} from "./config/settings.keys";
import type { GuiEvent } from "./ports/queue";
import type { Env, EmailMessage } from "./env";
import { buildContext, type WorkerContext } from "./context";
import { handleGuiEvents } from "./queues/gui-events";
import { HomePage } from "./ui/pages/home";
import { LoginPage } from "./ui/pages/login";
import { RegisterPage } from "./ui/pages/register";
import { CodePage } from "./ui/pages/code";
import { CodeNewPage } from "./ui/pages/code-new";
import { CodeSessionPage } from "./ui/pages/code-session";
import { createFragments } from "./ui/fragments";
import { HealingPage } from "./ui/pages/healing";
import { InspectionPage } from "./ui/pages/inspection";
import { WebhooksPage } from "./ui/pages/webhooks";
import { SettingsPage } from "./ui/pages/settings";
import { AdminPage } from "./ui/pages/admin";
import type { AuthedUser } from "./auth/service";
import tailwindCss from "./ui/styles/tailwind.generated.css";

type EnvWithIdentity = { Variables: { identity?: { user: AuthedUser; scopes?: string } } };

export { HealingWorkflow } from "./workflows/healing";

let migrated = false;
let cachedApp: Awaited<ReturnType<typeof buildApp>> | undefined;

const SESSION_COOKIE = "ouro_session";

async function ensureMigrated(env: Env): Promise<void> {
  if (migrated) return;
  const { D1Adapter } = await import("./adapters/d1.adapter");
  await runMigrations(new D1Adapter(env.DB));
  migrated = true;
}

function makeTriggerHealing(env: Env, ctx: WorkerContext) {
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
      tag: env.CF_VERSION_METADATA?.tag ?? null,
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

function makeCancelHealing(env: Env, ctx: WorkerContext) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (runId: string): Promise<{ ok: boolean; error?: string }> => {
    const run = await runs.find(runId);
    if (!run) return { ok: false, error: "run not found" };
    const active = ["queued", "scanning", "analyzing", "fixing", "running"];
    if (!active.includes(run.status)) {
      return { ok: false, error: `cannot cancel status: ${run.status}` };
    }
    if (run.workflow_id) {
      try {
        const instance = await env.HEALING_WORKFLOW.get(run.workflow_id);
        await instance.terminate();
      } catch (err) {
        // instance が既に終了している場合もある
        console.warn("[cancelHealing] terminate failed:", err instanceof Error ? err.message : err);
      }
    }
    await runs.update(runId, {
      status: "canceled",
      summary: JSON.stringify({ canceled: true, at: Date.now() }),
    });
    return { ok: true };
  };
}

async function buildApp(env: Env): Promise<Hono> {
  const ctx = await buildContext(env);
  const triggerHealing = makeTriggerHealing(env, ctx);
  const cancelHealing = makeCancelHealing(env, ctx);
  const app = new Hono();

  app.use("*", async (_c, next) => {
    await ensureMigrated(env);
    await next();
  });

  const apiDeps = {
    ...ctx,
    triggerHealing,
    cancelHealing,
    encryptionKey: ctx.encryptionKey,
  };
  mountApi(app, apiDeps);
  app.route("/ui/fragments", createFragments(apiDeps));

  const requireAuthMiddleware = async (c: Context<EnvWithIdentity>, next: Next) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (!sid) {
      const next_ =
        c.req.path !== "/login"
          ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "")
          : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    const user = await ctx.auth.resolveSession(sid);
    if (!user) {
      const next_ =
        c.req.path !== "/login"
          ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "")
          : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    c.set("identity", { user, scopes: "admin" });
    await next();
  };

  app.get("/assets/tailwind.css", (c) => {
    return c.body(tailwindCss, 200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=3600",
    });
  });

  app.get("/login", async (c) => {
    if ((await ctx.auth.userCount()) === 0) {
      return c.redirect("/register?first=1", 302);
    }
    const next_ = c.req.query("next") || undefined;
    const error = c.req.query("error") || undefined;
    return c.html(<LoginPage next={next_} error={error} />);
  });

  app.get("/register", (c) => {
    const error = c.req.query("error") || undefined;
    const first = c.req.query("first") === "1";
    return c.html(<RegisterPage error={error} first={first} />);
  });

  app.get("/", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<HomePage user={identity?.user} />);
  });

  app.get("/healing", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<HealingPage user={identity?.user} />);
  });

  app.get("/inspection", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<InspectionPage user={identity?.user} selectedRepo={ctx.currentRepo} />);
  });

  app.get("/code", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<CodePage user={identity?.user} />);
  });

  app.get("/code/new", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<CodeNewPage user={identity?.user} selectedRepo={ctx.currentRepo} />);
  });

  app.get("/code/sessions/:id", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const sessionId = c.req.param("id")!;
    const { CodeSessionManager } = await import("./code/session.manager");
    const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.codeRunner, ctx.ports.ai);
    const session = await manager.get(sessionId, identity!.user.id);
    return c.html(
      <CodeSessionPage sessionId={sessionId} user={identity?.user} session={session as any} />
    );
  });

  app.get("/webhooks", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<WebhooksPage user={identity?.user} />);
  });

  app.get("/settings", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity!.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);

    const [models, globalModel, modeModels, rawSettings, webhooksEnabled, featureFlags] =
      await Promise.all([
        ctx.ports.ai.listModels?.().catch(() => []) ?? Promise.resolve([]),
        ctx.auth.getModel(user.id),
        ctx.auth.getModeModels(user.id),
        settingsRepo.get("app_settings"),
        areWebhooksEnabled(settingsRepo),
        getFeatureFlags(settingsRepo),
      ]);
    const modelsEffective: Record<string, string> = {};
    for (const mode of ["coding", "plan", "refactor", "healing", "inspection"] as const) {
      modelsEffective[mode] = modeModels[mode] ?? globalModel ?? DEFAULT_WORKERS_AI_MODEL;
    }

    let appSettings: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS };
    try {
      appSettings = { ...DEFAULT_APP_SETTINGS, ...(rawSettings ? JSON.parse(rawSettings) : {}) };
    } catch {}

    return c.html(
      <SettingsPage
        user={user}
        models={models}
        globalModel={globalModel}
        modeModels={modeModels}
        defaultModel={DEFAULT_WORKERS_AI_MODEL}
        effectiveModels={modelsEffective}
        appSettings={appSettings}
        webhooksEnabled={webhooksEnabled}
        featureFlags={featureFlags}
      />
    );
  });

  app.get("/admin", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    if (identity?.user.role !== "admin") {
      return c.redirect("/", 302);
    }
    return c.html(<AdminPage user={identity?.user} />);
  });

  app.get("/*", (c) => c.notFound());

  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      cachedApp ??= await buildApp(env);
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
  async email(message: EmailMessage, env: Env): Promise<void> {
    if (!env.EMAIL) return;
    console.log(`[worker] received email from ${message.from} to ${message.to}: ${message.subject}`);
    const recipients = (env.OURO_ALERT_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const dest of recipients) {
      try {
        await message.forward(dest);
        console.log(`[worker] forwarded email to ${dest}`);
      } catch (e: any) {
        console.error(`[worker] failed to forward email to ${dest}: ${e.message}`);
      }
    }
  },
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await ensureMigrated(env);
    const wctx = await buildContext(env);
    await wctx.auth.cleanupExpiredSessions();

    // スタック検出: 長時間進行中のままのジョブを failed にする
    const inspections = new InspectionRepository(wctx.ports.db);
    const runs = new HealingRunRepository(wctx.ports.db);
    const sessions = new CodeSessionRepository(wctx.ports.db);
    const nInsp = await inspections.failStale(30 * 60 * 1000);
    const nHeal = await runs.failStale(60 * 60 * 1000);
    const nCode = await sessions.failStale(10 * 60 * 1000);
    if (nInsp || nHeal || nCode) {
      console.log(`[scheduled] stale sweep: inspections=${nInsp} healing=${nHeal} code=${nCode}`);
    }

    if (await shouldRunScheduledHealing(wctx, new Date())) {
      const trigger = makeTriggerHealing(env, wctx);
      await trigger({ trigger: "cron", dryRun: false });
    }
  },
};

/**
 * app_settings.schedule.time（"HH:MM" UTC）の時（HH）が現在の UTC 時と一致するか判定する。
 */
export async function shouldRunScheduledHealing(
  wctx: WorkerContext,
  now: Date
): Promise<boolean> {
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
