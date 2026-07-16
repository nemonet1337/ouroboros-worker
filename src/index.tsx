/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx } from "hono/jsx";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { mountApi } from "./http/api";
import { runMigrations } from "./db";
import { HealingRunRepository, SettingsRepository, CodeSessionRepository } from "./db/repositories";
import { DEFAULT_WORKERS_AI_MODEL } from "./config/deployment";
import { CODE_INDEX_STATUS_KEY } from "./vectorize/code.indexer";
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
import { RefactorPage } from "./ui/pages/refactor";
import { RefactorProposalPage } from "./ui/pages/refactor-proposal";
import { createFragments } from "./ui/fragments";
import { HealingPage } from "./ui/pages/healing";
import { InspectionPage } from "./ui/pages/inspection";
import { WebhooksPage } from "./ui/pages/webhooks";
import { TokensPage } from "./ui/pages/tokens";
import { SettingsPage } from "./ui/pages/settings";
import { AdminPage } from "./ui/pages/admin";
import type { AuthedUser } from "./auth/service";
import tailwindCss from "./ui/styles/tailwind.generated.css";

type EnvWithIdentity = { Variables: { identity?: { user: AuthedUser; scopes?: string } } };

export { HealingWorkflow } from "./workflows/healing";

let migrated = false;
let cachedApp: Awaited<ReturnType<typeof buildApp>> | undefined;

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


async function buildApp(env: Env): Promise<Hono> {
  const ctx = await buildContext(env);
  const triggerHealing = makeTriggerHealing(env, ctx);
  const app = new Hono();

  app.use("*", async (c, next) => {
    await ensureMigrated(env);
    await next();
  });

  mountApi(app, { ...ctx, triggerHealing });

  // htmx 用 HTML フラグメント（GUI ウィジェットは JSON API ではなくこちらを読む）
  app.route("/ui/fragments", createFragments({ ...ctx, triggerHealing }));

  const requireAuthMiddleware = async (c: Context<EnvWithIdentity>, next: Next) => {
    const sid = c.req.header("cookie")?.match(/ouro_session=([^;]+)/)?.[1];
    if (!sid) {
      const next_ = c.req.path !== "/login"
        ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "")
        : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    const user = await ctx.auth.resolveSession(sid);
    if (!user) {
      const next_ = c.req.path !== "/login"
        ? c.req.path + (c.req.query() ? "?" + new URLSearchParams(c.req.query()).toString() : "")
        : "";
      const redirect = next_ ? `/login?next=${encodeURIComponent(next_)}` : "/login";
      return c.redirect(redirect, 302);
    }
    c.set("identity", { user, scopes: "admin" });
    await next();
  };

  // ビルド済み Tailwind v4 + daisyUI 5 CSS（npm run build:css で再生成）
  app.get("/assets/tailwind.css", (c) => {
    return c.body(tailwindCss, 200, {
      "content-type": "text/css; charset=utf-8",
      "cache-control": "public, max-age=3600",
    });
  });

  app.get("/login", async (c) => {
    // アカウントが 1 件も無い初回起動時は登録画面へ誘導する
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
    return c.html(<InspectionPage user={identity?.user} />);
  });

  app.get("/code", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<CodePage user={identity?.user} />);
  });

  app.get("/code/new", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<CodeNewPage user={identity?.user} />);
  });

  app.get("/code/sessions/:id", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const sessionId = c.req.param("id")!;
    const sessions = new CodeSessionRepository(ctx.ports.db);
    const session = await sessions.get(sessionId, identity!.user.id);
    return c.html(
      <CodeSessionPage sessionId={sessionId} user={identity?.user} session={session as any} />
    );
  });

  app.get("/refactor", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<RefactorPage user={identity?.user} />);
  });

  app.get("/refactor/proposals/:id", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<RefactorProposalPage inspectionId={c.req.param("id")!} user={identity?.user} />);
  });

  app.get("/webhooks", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<WebhooksPage user={identity?.user} />);
  });

  app.get("/tokens", requireAuthMiddleware, (c) => {
    const identity = c.get("identity");
    return c.html(<TokensPage user={identity?.user} />);
  });

  app.get("/settings", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity!.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);

    const [models, globalModel, modeModels, rawSettings, rawIndexStatus, registrationEnabled] =
      await Promise.all([
        ctx.ports.ai.listModels?.().catch(() => []) ?? Promise.resolve([]),
        ctx.auth.getModel(user.id),
        ctx.auth.getModeModels(user.id),
        settingsRepo.get("app_settings"),
        settingsRepo.get(CODE_INDEX_STATUS_KEY),
        ctx.auth.isRegistrationEnabled(),
      ]);

    let appSettings: Record<string, unknown> = {};
    try {
      appSettings = rawSettings ? JSON.parse(rawSettings) : {};
    } catch {}
    appSettings.registrationEnabled = registrationEnabled;

    let codeIndexStatus = null;
    try {
      codeIndexStatus = rawIndexStatus ? JSON.parse(rawIndexStatus) : null;
    } catch {}

    return c.html(
      <SettingsPage
        user={user}
        models={models}
        globalModel={globalModel}
        modeModels={modeModels}
        defaultModel={DEFAULT_WORKERS_AI_MODEL}
        appSettings={appSettings}
        codeIndexStatus={codeIndexStatus}
        vectorizeCodeEnabled={!!ctx.ports.vectorizeCode}
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
    const trigger = makeTriggerHealing(env, wctx);
    await trigger({ trigger: "cron", dryRun: false });
  },
};
