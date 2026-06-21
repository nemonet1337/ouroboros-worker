/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx } from "hono/jsx";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import { mountApi } from "./http/api";
import { runMigrations } from "./db";
import { HealingRunRepository } from "./db/repositories";
import type { GuiEvent } from "./ports/queue";
import type { Env } from "./env";
import { buildContext, type WorkerContext } from "./context";
import { handleGuiEvents } from "./queues/gui-events";

type EnvWithIdentity = { Variables: { identity?: { user: { role?: string }; scopes?: string } } };

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

function isUiRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/") ||
    pathname.startsWith("/healing") ||
    pathname.startsWith("/inspection") ||
    pathname.startsWith("/code") ||
    pathname.startsWith("/refactor") ||
    pathname.startsWith("/webhooks") ||
    pathname.startsWith("/tokens") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/admin")
  );
}

async function buildApp(env: Env): Promise<Hono> {
  const ctx = await buildContext(env);
  const triggerHealing = makeTriggerHealing(env, ctx);
  const app = new Hono();

  app.use("*", async (c, next) => {
    await ensureMigrated(env);
    await next();
  });

  mountApi(app, { ...ctx, triggerHealing, cookieSecure: true });

  const requireAuthMiddleware = async (c: Context<EnvWithIdentity>, next: Next) => {
    const sid = c.req.header("cookie")?.match(/ouro_session=([^;]+)/)?.[1];
    if (!sid) {
      return c.redirect("/login", 302);
    }
    const user = await ctx.auth.resolveSession(sid);
    if (!user) {
      return c.redirect("/login", 302);
    }
    c.set("identity", { user, scopes: "admin" });
    await next();
  };

  app.get("/login", (c) => {
    const url = new URL(c.req.url);
    const next_ = url.searchParams.get("next") || "/";
    return c.html(
      <html lang="ja" data-theme="night">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Login - Ouroboros</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://cdn.jsdelivr.net/npm/daisyui@5.0.0-beta.2/dist/full.min.css" rel="stylesheet" type="text/css" />
          <script src="https://unpkg.com/htmx.org@2.0.8"></script>
        </head>
        <body class="min-h-screen bg-base-300 flex items-center justify-center p-4">
          <div class="card bg-base-100 shadow-xl w-full max-w-sm">
            <div class="card-body">
              <h2 class="card-title justify-center text-2xl mb-4">Login</h2>
              <form hx-post="/api/v1/auth/login" hx-target="this" hx-swap="outerHTML">
                <div class="form-control mb-4">
                  <label class="label" for="email"><span class="label-text">Email</span></label>
                  <input type="email" name="email" id="email" placeholder="you@example.com" class="input input-bordered w-full" required />
                </div>
                <div class="form-control mb-6">
                  <label class="label" for="password"><span class="label-text">Password</span></label>
                  <input type="password" name="password" id="password" placeholder="••••••••" class="input input-bordered w-full" required />
                </div>
                <input type="hidden" name="next" value={next_} />
                <div class="form-control" hidden>
                  <button type="submit" class="btn btn-primary w-full">Login</button>
                </div>
              </form>
              <div class="text-center text-sm">
                <a href="/register">Create an account</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  });

  app.get("/register", async (c) => {
    const enabled = c.req.header("cookie")?.match(/ouro_session=([^;]+)/)
      ? true
      : false;
    const url = new URL(c.req.url);
    return c.html(
      <html lang="ja" data-theme="night">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Register - Ouroboros</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://cdn.jsdelivr.net/npm/daisyui@5.0.0-beta.2/dist/full.min.css" rel="stylesheet" type="text/css" />
          <script src="https://unpkg.com/htmx.org@2.0.8"></script>
        </head>
        <body class="min-h-screen bg-base-300 flex items-center justify-center p-4">
          <div class="card bg-base-100 shadow-xl w-full max-w-sm">
            <div class="card-body">
              <h2 class="card-title justify-center text-2xl mb-4">Register</h2>
              <form hx-post="/api/v1/auth/register" hx-target="this" hx-swap="outerHTML">
                <div class="form-control mb-4">
                  <label class="label" for="email"><span class="label-text">Email</span></label>
                  <input type="email" name="email" id="email" placeholder="you@example.com" class="input input-bordered w-full" required />
                </div>
                <div class="form-control mb-6">
                  <label class="label" for="password"><span class="label-text">Password</span></label>
                  <input type="password" name="password" id="password" placeholder="••••••••" class="input input-bordered w-full" minlength={8} required />
                </div>
                <div class="form-control" hidden>
                  <button type="submit" class="btn btn-primary w-full">Register</button>
                </div>
              </form>
              <div class="text-center text-sm">
                <a href="/login">Already have an account? Login</a>
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  });

  app.get("/healing", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Healing</h1></body></html>));
  app.get("/inspection", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Inspection</h1></body></html>));
  app.get("/code", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Code Mode</h1></body></html>));
  app.get("/refactor", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Refactor</h1></body></html>));
  app.get("/webhooks", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Webhooks</h1></body></html>));
  app.get("/tokens", requireAuthMiddleware, async (c) => c.html(<html><body><h1>API Tokens</h1></body></html>));
  app.get("/settings", requireAuthMiddleware, async (c) => c.html(<html><body><h1>Settings</h1></body></html>));
  app.get("/admin", requireAuthMiddleware, async (c) => {
    const identity = c.get("identity");
    if (identity?.user.role !== "admin") {
      return c.redirect("/", 302);
    }
    return c.html(<html><body><h1>Admin</h1></body></html>);
  });

  app.get("/*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (isUiRoute(pathname)) {
      const url = new URL(c.req.url);
      url.pathname = "/";
      const userHeader = c.req.header("x-identity");
      return c.html(
        <html lang="ja" data-theme="night">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Ouroboros</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://cdn.jsdelivr.net/npm/daisyui@5.0.0-beta.2/dist/full.min.css" rel="stylesheet" type="text/css" />
            <script src="https://unpkg.com/htmx.org@2.0.8"></script>
            <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
            <script src="https://unpkg.com/lucide@latest"></script>
          </head>
          <body class="min-h-screen bg-base-300">
            <div class="drawer lg:drawer-open">
              <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />
              <div class="drawer-content flex flex-col">
                <div class="navbar bg-primary text-primary-content px-4">
                  <div class="flex-1">
                    <a href="/" class="btn btn-ghost text-xl font-bold tracking-tight">Ouroboros</a>
                  </div>
                  <div class="flex-none px-2">
                    <span class="text-xs opacity-75 font-mono">
                      {env.CF_VERSION_METADATA ? `tag: ${env.CF_VERSION_METADATA.tag}` : "v2.0.0"}
                    </span>
                  </div>
                </div>
                <main class="flex-1 p-6 max-w-7xl mx-auto w-full">
                  <div class="alert alert-info">Ouroboros UI</div>
                </main>
              </div>
            </div>
          </body>
        </html>
      );
    }
    return c.notFound();
  });

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
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await ensureMigrated(env);
    const wctx = await buildContext(env);
    await wctx.auth.cleanupExpiredSessions();
    const trigger = makeTriggerHealing(env, wctx);
    await trigger({ trigger: "cron", dryRun: false });
  },
};
