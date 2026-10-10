/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx } from "hono/jsx";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { mountApi } from "./http/api";
import {
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
  InspectionRepository,
} from "./db/repositories";
import { DEFAULT_TEXT_MODEL } from "./config/deployment";
import { getFeatureFlags, getRoutingConfig, DEFAULT_APP_SETTINGS } from "./config/settings.keys";
import type { GuiEvent } from "./ports/queue";
import type { AppConfig } from "./env";
import { runHealingLifecycle } from "./healing/lifecycle";
import { shouldRunScheduledHealing } from "./cron";
import { buildContext, type WorkerContext } from "./context";
import type { TriggerHealingOpts } from "./http/api";
import { isHealingActive } from "./healing/status";
import { mergeHealingSummary } from "./healing/summary";
import { handleGuiEvents } from "./queues/gui-events";
import { HomePage } from "./ui/pages/home";
import { LoginPage } from "./ui/pages/login";
import { RegisterPage } from "./ui/pages/register";
import { CodePage } from "./ui/pages/code";
import { CodeNewPage } from "./ui/pages/code-new";
import { CodeSessionPage } from "./ui/pages/code-session";
import { createFragments } from "./ui/fragments";
import { HealingPage } from "./ui/pages/healing";
import { HealingAnalysisPage } from "./ui/pages/healing-analysis";
import { SettingsPage } from "./ui/pages/settings";
import { ModelsPage } from "./ui/pages/models";
import { AdminPage } from "./ui/pages/admin";
import type { AuthedUser } from "./auth/service";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

type EnvWithIdentity = { Variables: { identity?: { user: AuthedUser; scopes?: string } } };



const SESSION_COOKIE = "ouro_session";

/** ビルド成果物の CSS を読む。未ビルド時は空文字（スタイル無しで動く）。 */
function loadTailwindCss(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "ui/styles/tailwind.generated.css"), "utf8");
  } catch {
    return "";
  }
}

export function makeTriggerHealing(config: AppConfig, ctx: WorkerContext) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (opts: TriggerHealingOpts) => {
    const now = Date.now();
    const phase = opts.phase ?? "analyze";
    const autoFix = opts.autoFix ?? opts.trigger === "cron";
    const dryRun = opts.dryRun ?? false;

    if (phase === "fix") {
      const runId = opts.runId ?? "";
      if (!runId) return { runId: "", error: "runId required" };
      const run = await runs.find(runId);
      if (!run) return { runId, error: "run not found" };
      if (run.status !== "analyzed") return { runId, error: `cannot fix status: ${run.status}` };
      await runs.update(runId, { status: "queued" });
      const event: GuiEvent = {
        id: crypto.randomUUID(),
        type: "healing.requested",
        userId: opts.userId,
        payload: { runId, dryRun, trigger: opts.trigger, phase: "fix", autoFix: false },
        enqueuedAt: now,
      };
      await ctx.ports.queue.send(event);
      return { runId };
    }

    const runId = crypto.randomUUID();
    await runs.create({
      id: runId,
      user_id: opts.userId ?? null,
      status: "queued",
      trigger: opts.trigger,
      workflow_id: null,
      summary: null,
      tag: null,
      inspection_id: null,
      model: null,
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_prompt_tokens: 0,
      cache_write_prompt_tokens: 0,
      fix_model: null,
      fix_prompt_tokens: 0,
      fix_completion_tokens: 0,
      fix_cached_prompt_tokens: 0,
      fix_cache_write_prompt_tokens: 0,
      created_at: now,
      updated_at: now,
    });
    const event: GuiEvent = {
      id: crypto.randomUUID(),
      type: "healing.requested",
      userId: opts.userId,
      payload: {
        runId,
        dryRun,
        trigger: opts.trigger,
        phase: "analyze",
        autoFix,
        instruction: opts.instruction?.trim() || undefined,
      },
      enqueuedAt: now,
    };
    await ctx.ports.queue.send(event);
    return { runId };
  };
}

export function makeCancelHealing(ctx: WorkerContext) {
  const runs = new HealingRunRepository(ctx.ports.db);
  return async (runId: string): Promise<{ ok: boolean; error?: string }> => {
    const run = await runs.find(runId);
    if (!run) return { ok: false, error: "run not found" };
    if (!isHealingActive(run.status)) {
      return { ok: false, error: `cannot cancel status: ${run.status}` };
    }
    // 逐次キューのため status を canceled にし、lifecycle 側に次のステップで止めさせる
    await runs.update(runId, {
      status: "canceled",
      summary: mergeHealingSummary(run.summary, { canceled: true, at: Date.now() }),
    });
    return { ok: true };
  };
}

export async function buildApp(config: AppConfig, ctx: WorkerContext): Promise<Hono> {
  const triggerHealing = makeTriggerHealing(config, ctx);
  const cancelHealing = makeCancelHealing(ctx);
  const tailwindCss = loadTailwindCss();
  const app = new Hono();

  const apiDeps = {
    ...ctx,
    triggerHealing,
    cancelHealing,
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
    const repo = ctx.currentRepo;
    const selectedRepo = repo.owner && repo.repo ? repo : null;
    return c.html(<HealingPage user={identity?.user} selectedRepo={selectedRepo} />);
  });

  app.get("/healing/:runId", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const runId = c.req.param("runId")!;
    const runRepo = new HealingRunRepository(ctx.ports.db);
    const inspectionRepo = new InspectionRepository(ctx.ports.db);
    const run = await runRepo.find(runId);
    if (!run) return c.notFound();
    let result = null;
    if (run.inspection_id) {
      const row = await inspectionRepo.findById(run.inspection_id);
      if (row?.result) {
        try {
          result = JSON.parse(row.result);
        } catch {
          result = null;
        }
      }
    }
    return c.html(<HealingAnalysisPage user={identity?.user} run={run} result={result} />);
  });

  app.get("/inspection", requireAuthMiddleware, (c) => c.redirect("/healing", 302));

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
    const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.codeRunner);
    const session = await manager.get(sessionId, identity!.user.id);
    const traceRows = await ctx.ports.db.query<{ value: string }>(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = 'harnessTrace'`,
      [sessionId]
    );
    let harnessTrace = null;
    if (traceRows[0]?.value) {
      try {
        harnessTrace = JSON.parse(traceRows[0].value);
      } catch {
        harnessTrace = null;
      }
    }
    return c.html(
      <CodeSessionPage
        sessionId={sessionId}
        user={identity?.user}
        session={session as any}
        harnessTrace={harnessTrace}
      />
    );
  });

  app.get("/models", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity!.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);
    const [models, selectedModel, routing] = await Promise.all([
      ctx.ports.ai.listModels?.().catch(() => []) ?? Promise.resolve([]),
      ctx.auth.getModel(user.id),
      getRoutingConfig(settingsRepo),
    ]);
    return c.html(
      <ModelsPage
        user={user}
        models={models}
        selectedModel={selectedModel}
        defaultModel={DEFAULT_TEXT_MODEL}
        routing={routing}
      />
    );
  });

  app.get("/settings", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    const user = identity!.user;
    const settingsRepo = new SettingsRepository(ctx.ports.db);

    const [rawSettings, featureFlags] = await Promise.all([
      settingsRepo.get("app_settings"),
      getFeatureFlags(settingsRepo),
    ]);

    let appSettings: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS };
    try {
      appSettings = { ...DEFAULT_APP_SETTINGS, ...(rawSettings ? JSON.parse(rawSettings) : {}) };
    } catch {}

    return c.html(
      <SettingsPage
        user={user}
        appSettings={appSettings}
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
