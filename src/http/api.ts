import { Hono, type Context, type Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Ports } from "../ports";
import type { AiModelInfo } from "../ports/ai";
import type { HealingConfig } from "../config/healing.config";
import {
  DEFAULT_WORKERS_AI_MODEL,
  type DeployTarget,
} from "../config/deployment";
import { AuthService, AuthError, type AuthedUser } from "../auth/service";
import { parseScopes, hasScope, newId, type Scope } from "../auth/tokens";
import { Logger } from "../logging/logger";
import {
  InspectionRepository,
  WebhookRepository,
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
} from "../db/repositories";
import type { InspectionRequest } from "../types";
import { validateWebhookUrl } from "../webhook/url.guard";
import { OPENAPI_SPEC } from "./openapi";
import { CodeSessionManager } from "../code/session.manager";
import { ProposalManager } from "../refactor/proposal.manager";
import { FlagService, FLAGS } from "../flags/flag.service";
import type { VersionMetadata } from "../env";
import {
  validateBody,
  credentialsSchema,
  profileUpdateSchema,
  tokenCreateSchema,
  inspectSchema,
  webhookCreateSchema,
  webhookPatchSchema,
  settingsSchema,
  configSchema,
  codeSessionCreateSchema,
  codeSessionActionSchema,
  modelSchema,
  modeModelsSchema,
} from "./validation";
import { MODEL_MODES, type ModelMode } from "../config/model.modes";
import { CODE_INDEX_STATUS_KEY } from "../vectorize/code.indexer";
import {
  buildMetricsData,
  loadPublicConfig,
  parseHistoryEntry,
  runUserInspection,
  shapeWebhookRow,
  CONFIG_KEY,
  LEGACY_GATEWAY_CONFIG_KEYS,
} from "./data";

const SESSION_COOKIE = "ouro_session";
const API_VERSION = "v1";
const SETTINGS_KEY = "app_settings";

const DEFAULT_SETTINGS = {
  weights: { security: 25, performance: 20, redundancy: 15, readability: 15, design: 15, correctness: 10 },
  gradeThresholds: { S: 95, A: 85, B: 70, C: 55, D: 40, F: 0 },
  schedule: { mode: "cron", cronExpr: "0 3 * * *", cronTimezone: "Asia/Tokyo" },
  notifications: { browserPush: true, emailDigest: true, emailThreshold: false, sound: false },
};

export interface TriggerHealingResult {
  runId: string;
  workflowId?: string;
}

export interface ApiDeps {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  /** Platform-specific kickoff: inline cycle (server) or Workflow instance (worker). */
  triggerHealing: (opts: { trigger: string; userId?: string; dryRun: boolean }) => Promise<TriggerHealingResult>;
  cookieSecure?: boolean;
  /** Always "cloudflare": ONLY the Workers AI binding (ports.ai) is accepted —
   * external gateway tokens are rejected and models are discovered from the
   * binding. */
  deployTarget?: DeployTarget;
  /**
   * When explicitly set, overrides the DB-persisted registration toggle.
   * true = open registration; false = closed (first-user bootstrap still allowed).
   * Unset = fall back to the DB setting managed via the settings API.
   */
  registrationEnabled?: boolean;
  /** Whether GITHUB_TOKEN is set as a CF Secret. Used by GET /config for read-only display. */
  githubTokenSet?: boolean;
  flags?: FlagService;
  versionMetadata?: VersionMetadata;
}

interface Identity {
  user: AuthedUser;
  scopes: string; // csv; sessions get full "admin"
}

type Env = { Variables: { identity?: Identity; body?: unknown } };

function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * The shared Ouroboros HTTP API (Hono). Runtime-agnostic — mounted by both the
 * Node server and the Cloudflare Worker at `/api/v1` (and `/api` for compat).
 * Routes are defined relative to the mount point (no `/api` prefix here).
 */
export function createApi(deps: ApiDeps): Hono<Env> {
  const { ports, auth, logger } = deps;
  const deployTarget: DeployTarget = deps.deployTarget ?? "cloudflare";
  const app = new Hono<Env>();
  const log = logger.child("api");

  const inspections = new InspectionRepository(ports.db);
  const webhooks = new WebhookRepository(ports.db);
  const runs = new HealingRunRepository(ports.db);
  const settingsRepo = new SettingsRepository(ports.db);
  const codeSessions = new CodeSessionRepository(ports.db);
  const codeManager = new CodeSessionManager(ports.db, ports.codeRunner, ports.ai);

  // ── Unified error handling ─────────────────────────────────────────────────
  app.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: { code: "auth_error", message: err.message } }, err.status as 400);
    }
    log.error("unhandled api error", { reason: err.message });
    return c.json({ error: { code: "internal_error", message: err.message || "internal server error" } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: "not_found", message: "resource not found" } }, 404));

  // ── Rate limiting on auth endpoints ─────────────────────────────────────────
  app.use("/auth/*", async (c, next) => {
    const { success } = await ports.rateLimiter.limit(`auth:${clientIp(c)}`);
    if (!success) return c.json({ error: { code: "rate_limited", message: "rate limit exceeded" } }, 429);
    await next();
  });

  // ── Identity resolution (cookie session OR bearer token) ───────────────────
  app.use("*", async (c: Context<Env>, next: Next) => {
    const bearer = c.req.header("authorization");
    if (bearer?.startsWith("Bearer ")) {
      const id = await auth.resolveToken(bearer.slice(7).trim());
      if (id) c.set("identity", { user: { id: id.id, email: id.email, role: id.role, model: id.model }, scopes: id.scopes });
    } else {
      const sid = getCookie(c, SESSION_COOKIE);
      if (sid) {
        const user = await auth.resolveSession(sid);
        if (user) c.set("identity", { user, scopes: "admin" });
      }
    }
    await next();
  });

  const requireAuth = (scope?: Scope) => async (c: Context<Env>, next: Next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    if (scope && !hasScope(identity.scopes, scope)) {
      return c.json({ error: { code: "forbidden", message: `missing scope: ${scope}` } }, 403);
    }
    await next();
  };
  const requireAdmin = async (c: Context<Env>, next: Next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    if (identity.user.role !== "admin") return c.json({ error: { code: "forbidden", message: "admin only" } }, 403);
    await next();
  };

  const requireFlag = (flagName: string, defaultValue: boolean) => {
    return async (c: Context, next: Next) => {
      if (deps.flags) {
        const enabled = await deps.flags.get(flagName, defaultValue);
        if (!enabled) {
          return c.json({ error: { code: "forbidden", message: `Feature ${flagName} is disabled` } }, 403);
        }
      }
      await next();
    };
  };

  // ── Meta ─────────────────────────────────────────────────────────────────
  app.get("/health", (c) => c.json({ ok: true, db: ports.db.dialect }));
  app.get("/version", (c) =>
    c.json({
      name: "ouroboros",
      version: "2.0.0",
      apiVersion: API_VERSION,
      deployTarget,
      versionMetadata: deps.versionMetadata || null,
    })
  );
  app.get("/openapi.json", (c) => c.json(OPENAPI_SPEC));

  // ── Auth ─────────────────────────────────────────────────────────────────
  // firstUser=true means no account exists yet: the GUI redirects to /register
  // and the next registration bootstraps the admin.
  app.get("/auth/registration", async (c) => {
    const firstUser = (await auth.userCount()) === 0;
    const enabled =
      deps.registrationEnabled !== undefined
        ? deps.registrationEnabled
        : await auth.isRegistrationEnabled();
    return c.json({ enabled, firstUser });
  });

  // htmx がロードされていない環境（CDN 障害等）ではフォームがネイティブ送信される。
  // その場合は JSON ではなくリダイレクトで応答してログイン/登録を成立させる。
  const isNativeFormPost = (c: Context) =>
    !c.req.header("HX-Request") &&
    (c.req.header("content-type") ?? "").includes("form");

  app.post("/auth/register", validateBody(credentialsSchema), async (c) => {
    const { email, password } = c.get("body") as { email: string; password: string };

    // Env-var override takes precedence over the DB setting (first user always allowed).
    if (deps.registrationEnabled === false && (await auth.userCount()) > 0) {
      if (isNativeFormPost(c)) {
        return c.redirect(`/register?error=${encodeURIComponent("registration is disabled")}`, 302);
      }
      return c.json({ error: { code: "forbidden", message: "registration is disabled" } }, 403);
    }

    try {
      const user = await auth.register(email, password);
      const { sessionId } = await auth.login(email, password);
      setSession(c, sessionId);
      if (c.req.header("HX-Request")) {
        c.header("HX-Redirect", "/");
        return c.html("");
      }
      if (isNativeFormPost(c)) return c.redirect("/", 302);
      return c.json({ user }, 201);
    } catch (err) {
      if (err instanceof AuthError) {
        if (c.req.header("HX-Request")) {
          return c.html(
            `<div class="alert bg-rose-600 text-white border border-rose-700"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>${err.message}</span></div><script>lucide.createIcons()</script>`
          );
        }
        if (isNativeFormPost(c)) {
          return c.redirect(`/register?error=${encodeURIComponent(err.message)}`, 302);
        }
      }
      throw err;
    }
  });

  app.post("/auth/login", validateBody(credentialsSchema), async (c) => {
    const { email, password } = c.get("body") as { email: string; password: string };
    const next = c.req.query("next") || "/";

    try {
      const { user, sessionId } = await auth.login(email, password);
      setSession(c, sessionId);
      if (c.req.header("HX-Request")) {
        c.header("HX-Redirect", next);
        return c.html("");
      }
      if (isNativeFormPost(c)) return c.redirect(next, 302);
      return c.json({ user });
    } catch (err) {
      if (err instanceof AuthError) {
        if (c.req.header("HX-Request")) {
          return c.html(
            `<div class="alert bg-rose-600 text-white border border-rose-700"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>${err.message}</span></div><script>lucide.createIcons()</script>`
          );
        }
        if (isNativeFormPost(c)) {
          const params = new URLSearchParams({ error: err.message });
          if (next !== "/") params.set("next", next);
          return c.redirect(`/login?${params.toString()}`, 302);
        }
      }
      throw err;
    }
  });

  app.post("/auth/logout", async (c) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) await auth.logout(sid);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    if (c.req.header("HX-Request")) {
      c.header("HX-Redirect", "/login");
      return c.html("");
    }
    return c.json({ ok: true });
  });

  app.get("/auth/me", requireAuth(), (c) => c.json({ user: c.get("identity")!.user }));

  app.put("/auth/me", requireAuth(), validateBody(profileUpdateSchema), async (c) => {
    const body = c.get("body") as { email: string; password?: string };
    const identity = c.get("identity")!;
    const user = await auth.updateProfile(identity.user.id, body.email, body.password);
    return c.json({ user });
  });

  // ── API tokens ─────────────────────────────────────────────────────────────
  app.get("/tokens", requireAuth(), async (c) => {
    return c.json({ tokens: await auth.listTokens(c.get("identity")!.user.id) });
  });

  app.post("/tokens", requireAuth(), validateBody(tokenCreateSchema), async (c) => {
    const body = c.get("body") as { name: string; scopes?: Scope[]; expiresInDays?: number };
    const scopes = (body.scopes ?? ["read"]).filter((s) => parseScopes(s).length > 0);
    const created = await auth.createToken(
      c.get("identity")!.user.id,
      body.name ?? "token",
      scopes.length ? scopes : (["read"] as Scope[]),
      body.expiresInDays
    );
    return c.json(created, 201); // secret returned exactly once
  });

  app.delete("/tokens/:id", requireAuth(), async (c) => {
    await auth.revokeToken(c.get("identity")!.user.id, c.req.param("id")!);
    return c.json({ ok: true });
  });

  // ── App config (languages; git + AI credentials come from CF Secrets) ──────
  app.get("/config", requireAuth(), async (c) => {
    return c.json(await loadPublicConfig(settingsRepo, deps.config.vcs, deps.githubTokenSet ?? false));
  });

  app.put("/config", requireAdmin, validateBody(configSchema), async (c) => {
    const incoming = c.get("body") as Record<string, unknown>;
    const raw = await settingsRepo.get(CONFIG_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    // Git credentials are managed via CF Secrets — never store in DB.
    for (const k of ["gitToken", "gitPackage", "gitService", ...LEGACY_GATEWAY_CONFIG_KEYS]) delete existing[k];
    const toSave: Record<string, unknown> = { ...existing };
    if (Array.isArray(incoming.selectedLanguages)) {
      toSave.selectedLanguages = incoming.selectedLanguages;
    }
    await settingsRepo.set(CONFIG_KEY, JSON.stringify(toSave));
    return c.json({ ok: true });
  });

  // ── AI models — every model served by the Workers AI binding ──────────────
  app.get("/models", requireAuth(), async (c) => {
    const provider = ports.ai.name;
    let models: AiModelInfo[] = [];
    try {
      models = (await ports.ai.listModels?.()) ?? [];
    } catch (err) {
      await log.error("model discovery failed", { reason: (err as Error).message });
      return c.json({ error: { code: "model_discovery_failed", message: (err as Error).message } }, 502);
    }
    return c.json({ deployTarget, provider, models });
  });

  // ── Settings (weights/thresholds/schedule/notifications/registration) ──────
  app.get("/settings", requireAuth(), async (c) => {
    const raw = await settingsRepo.get(SETTINGS_KEY);
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return c.json({
      ...DEFAULT_SETTINGS,
      ...stored,
      registrationEnabled: await auth.isRegistrationEnabled(),
    });
  });

  app.put("/settings", requireAdmin, validateBody(settingsSchema), async (c) => {
    const body = c.get("body") as Record<string, unknown>;
    if (typeof body.registrationEnabled === "boolean") {
      await auth.setRegistrationEnabled(body.registrationEnabled);
    }
    const raw = await settingsRepo.get(SETTINGS_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const { registrationEnabled: _omit, ...rest } = body;
    const merged = { ...DEFAULT_SETTINGS, ...existing, ...rest };
    await settingsRepo.set(SETTINGS_KEY, JSON.stringify(merged));
    return c.json({ ...merged, registrationEnabled: await auth.isRegistrationEnabled() });
  });

  app.get("/settings/model", requireAuth(), async (c) => {
    const user = c.get("identity")!.user;
    const model = await auth.getModel(user.id);
    return c.json({
      model: model,
      effectiveModel: model ?? DEFAULT_WORKERS_AI_MODEL,
      isDefault: model === null,
    });
  });

  app.put("/settings/model", requireAuth(), validateBody(modelSchema), async (c) => {
    const user = c.get("identity")!.user;
    const { model } = c.get("body") as { model: string | null };
    await auth.setModel(user.id, model);
    return c.json({ ok: true });
  });

  // ── モード別 AI モデル設定 ────────────────────────────────────────────────
  app.get("/settings/models", requireAuth(), async (c) => {
    const user = c.get("identity")!.user;
    const global = await auth.getModel(user.id);
    const modes = await auth.getModeModels(user.id);
    const effective: Record<string, string> = {};
    for (const mode of MODEL_MODES) {
      effective[mode] = modes[mode] ?? global ?? DEFAULT_WORKERS_AI_MODEL;
    }
    return c.json({ global, modes, effective, default: DEFAULT_WORKERS_AI_MODEL });
  });

  app.put("/settings/models", requireAuth(), validateBody(modeModelsSchema), async (c) => {
    const user = c.get("identity")!.user;
    const body = c.get("body") as Record<string, string>;
    if (body.global !== undefined) {
      await auth.setModel(user.id, body.global === "" ? null : body.global);
    }
    for (const mode of MODEL_MODES) {
      if (body[mode] !== undefined) {
        await auth.setModeModel(user.id, mode, body[mode] === "" ? null : body[mode]);
      }
    }
    if (c.req.header("HX-Request")) {
      return c.html(
        `<div class="alert alert-success rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i><span>モデル設定を保存しました。</span></div><script>lucide.createIcons()</script>`
      );
    }
    return c.json({ ok: true });
  });

  // ── コードインデックス（Vectorize RAG）────────────────────────────────────
  app.post("/code-index/reindex", requireAdmin, async (c) => {
    if (!ports.vectorizeCode) {
      return c.json(
        { error: { code: "not_configured", message: "VECTORIZE_CODE binding is not configured" } },
        503
      );
    }
    // インデックス構築は数分かかるため Queue で非同期実行する
    await ports.queue.send({
      id: newId(),
      type: "codeindex.requested",
      userId: c.get("identity")!.user.id,
      payload: {},
      enqueuedAt: Date.now(),
    });
    if (c.req.header("HX-Request")) {
      return c.html(
        `<div class="alert alert-success rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i><span>インデックス作成をキューに登録しました。数分後にページを再読み込みして状態を確認してください。</span></div><script>lucide.createIcons()</script>`
      );
    }
    return c.json({ ok: true }, 202);
  });

  app.get("/code-index/status", requireAuth(), async (c) => {
    const raw = await settingsRepo.get(CODE_INDEX_STATUS_KEY);
    if (!raw) return c.json({ status: "none" });
    try {
      return c.json(JSON.parse(raw));
    } catch {
      return c.json({ status: "none" });
    }
  });

  // ── Inspection ─────────────────────────────────────────────────────────────
  app.post("/inspect", requireAuth("inspect"), validateBody(inspectSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const req = c.get("body") as InspectionRequest;
    const outcome = await runUserInspection({ ports, inspections, auth, log, userId, req });
    if (!outcome.ok) {
      return c.json({ error: { code: outcome.code, message: outcome.message } }, outcome.status);
    }
    return c.json(outcome.result);
  });

  app.get("/inspect/:id", requireAuth(), async (c) => {
    const row = await inspections.find(c.req.param("id")!, c.get("identity")!.user.id);
    if (!row) return c.json({ error: { code: "not_found", message: "inspection not found" } }, 404);
    return c.json(JSON.parse(row.result));
  });

  // History with score breakdown parsed from stored results (oldest → newest).
  app.get("/history", requireAuth(), async (c) => {
    const rows = await inspections.listByUser(c.get("identity")!.user.id, 50);
    return c.json(rows.map((r) => parseHistoryEntry(r)).reverse());
  });

  // ── Webhooks ─────────────────────────────────────────────────────────────
  app.get("/webhooks", requireAuth(), async (c) => {
    const rows = await webhooks.listByUser(c.get("identity")!.user.id);
    return c.json({ webhooks: rows.map(shapeWebhookRow) });
  });

  app.post("/webhooks", requireAuth(), validateBody(webhookCreateSchema), async (c) => {
    const body = c.get("body") as any;
    const id = newId();
    
    const configData = {
      name: body.name || "webhook",
      adapter: body.adapter || body.type || "generic",
      events: body.events || ["inspection.completed"],
      secret: body.secret || "",
      scoreThresholds: body.scoreThresholds || { overall: 70 },
    };

    await webhooks.insert({
      id,
      user_id: c.get("identity")!.user.id,
      url: body.url,
      type: configData.adapter,
      enabled: 1,
      config: JSON.stringify(configData),
      created_at: Date.now(),
    });
    return c.json({ id }, 201);
  });

  app.patch("/webhooks/:id", requireAuth(), validateBody(webhookPatchSchema), async (c) => {
    const body = c.get("body") as any;
    const hookId = c.req.param("id")!;
    const userId = c.get("identity")!.user.id;

    if (body.enabled !== undefined) {
      await webhooks.setEnabled(hookId, userId, body.enabled);
    }

    const rows = await webhooks.listByUser(userId);
    const existing = rows.find(r => r.id === hookId);
    
    if (existing) {
      let cfg: any = {};
      try {
        cfg = existing.config ? JSON.parse(existing.config) : {};
      } catch {}

      if (body.name !== undefined) cfg.name = body.name;
      if (body.type !== undefined) cfg.adapter = body.type;
      if (body.url !== undefined) cfg.url = body.url;
      if (body.events !== undefined) cfg.events = body.events;
      if (body.scoreThresholds !== undefined) cfg.scoreThresholds = body.scoreThresholds;
      if (body.secret !== undefined) cfg.secret = body.secret;

      const updates: string[] = [];
      const params: any[] = [];
      if (body.url !== undefined) { updates.push("url = ?"); params.push(body.url); }
      if (body.type !== undefined) { updates.push("type = ?"); params.push(body.type); }
      
      updates.push("config = ?");
      params.push(JSON.stringify(cfg));

      params.push(hookId, userId);
      await ports.db.exec(`UPDATE webhooks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`, params);
    }

    return c.json({ ok: true });
  });

  app.delete("/webhooks/:id", requireAuth(), async (c) => {
    await webhooks.delete(c.req.param("id")!, c.get("identity")!.user.id);
    return c.json({ ok: true });
  });

  // Test ping — runtime-agnostic fetch send with SSRF protection.
  app.post("/webhooks/:id/test", requireAuth(), async (c) => {
    const list = await webhooks.listByUser(c.get("identity")!.user.id);
    const hook = list.find((w) => w.id === c.req.param("id"));
    if (!hook) return c.json({ error: { code: "not_found", message: "webhook not found" } }, 404);
    try {
      validateWebhookUrl(hook.url);
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message }, 400);
    }
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "ouroboros-webhook-test" },
        body: JSON.stringify({ event: "test", message: "Ouroboros webhook test", at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      return c.json({ success: res.ok, statusCode: res.status });
    } catch (err) {
      return c.json({ success: false, error: (err as Error).message });
    }
  });

  // ── Self-healing ─────────────────────────────────────────────────────────
  app.post("/healing", requireAuth("heal"), async (c) => {
    const body = await c.req.json<{ dryRun?: boolean }>().catch(() => ({ dryRun: false }));
    const out = await deps.triggerHealing({
      trigger: "api",
      userId: c.get("identity")!.user.id,
      dryRun: body.dryRun ?? false,
    });
    return c.json(out, 202);
  });

  app.get("/healing", requireAuth(), async (c) => c.json({ runs: await runs.recent(50) }));

  // ── Logs (admin) ─────────────────────────────────────────────────────────
  app.get("/logs", requireAdmin, async (c) => c.json({ files: await ports.logs.list() }));
  app.get("/logs/:file", requireAdmin, async (c) => {
    const content = await ports.logs.read(c.req.param("file")!, 200_000).catch(() => "");
    return c.text(content);
  });

  // ── Metrics ─────────────────────────────────────────────────────────────
  app.get("/metrics", requireAuth(), async (c) => {
    return c.json(await buildMetricsData(inspections, runs, c.get("identity")!.user.id));
  });

  // ── Code Mode ──────────────────────────────────────────────────────────────
  app.get("/code/sessions", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const rows = await codeSessions.listByUser(userId);
    return c.json({ sessions: rows });
  });

  app.get("/code/sessions/:id", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const row = await codeSessions.get(c.req.param("id")!, userId);
    if (!row) return c.json({ error: { code: "not_found", message: "session not found" } }, 404);
    return c.json({ session: row });
  });

  app.post("/code/sessions", requireAuth("inspect"), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionCreateSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const body = c.get("body") as { repoUrl: string; branch?: string; baseBranch?: string; title: string; instruction: string };
    const id = await codeManager.create({
      userId,
      repoUrl: body.repoUrl,
      branch: body.branch ?? "main",
      baseBranch: body.baseBranch ?? "main",
      title: body.title,
      instruction: body.instruction,
    });
    return c.json({ id }, 201);
  });

  app.post("/code/sessions/:id/generate", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionActionSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const model = await auth.resolveModel(userId, "coding");
    const planModel = await auth.resolveModel(userId, "plan");
    await codeManager.generate(c.req.param("id")!, userId, { model, planModel });
    return c.json({ ok: true });
  });

  app.post("/code/sessions/:id/apply", requireAuth(), requireFlag(FLAGS.CODE_FIX_COMPLETE, true), validateBody(codeSessionActionSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const result = await codeManager.apply(c.req.param("id")!, userId, ports.vcs);
    return c.json(result);
  });

  app.delete("/code/sessions/:id", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionActionSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    await codeManager.dismiss(c.req.param("id")!, userId);
    return c.json({ ok: true });
  });

  // ── Refactor Mode ───────────────────────────────────────────────────────
  app.get("/refactor/proposals", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const rows = (await ports.db.query<{ status: string; created_at: number }>(
      `SELECT id, status, created_at as created_at FROM inspections WHERE user_id = ? AND status IN ('proposed', 'applied', 'dismissed') ORDER BY created_at DESC`,
      [userId]
    )) as { id: string; status: string; created_at: number }[];
    return c.json({ proposals: rows });
  });

  app.post("/refactor/:inspectionId/propose", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const repoUrl = `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    const model = await auth.resolveModel(userId, "refactor");
    await manager.generateProposal(c.req.param("inspectionId")!, userId, model);
    return c.json({ ok: true });
  });

  app.post("/refactor/proposals/:inspectionId/apply", requireAuth(), requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const repoUrl = `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    const model = await auth.resolveModel(userId, "refactor");
    const result = await manager.applyProposal(c.req.param("inspectionId")!, userId, ports.codeRunner, model);
    return c.json(result);
  });

  app.post("/refactor/proposals/:inspectionId/dismiss", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const repoUrl = `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    await manager.dismissProposal(c.req.param("inspectionId")!, userId);
    return c.json({ ok: true });
  });

  return app;
}

function setSession(c: Context, sessionId: string, secure?: boolean): void {
  const autoSecure = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: secure ?? autoSecure,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

/**
 * Mount the API on a root app at `/api/v1` (canonical) and `/api` (compat alias).
 * Hono does not inherit a sub-app's onError/notFound when mounted via route(),
 * so the unified error handlers are (re)applied to the root here.
 */
export function mountApi(root: Hono, deps: ApiDeps): void {
  root.route("/api/v1", createApi(deps));
  root.route("/api", createApi(deps));

  // Unmatched API routes must return a JSON 404, not fall through to the SPA
  // static fallback. Registered after the API routes (so defined routes win)
  // and before the entrypoint's static catch-all.
  root.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "resource not found" } }, 404));

  root.onError((err, c) => {
    if (err instanceof AuthError) {
      return c.json({ error: { code: "auth_error", message: err.message } }, err.status as 400);
    }
    deps.logger.child("api").error("unhandled api error", { reason: err.message });
    return c.json({ error: { code: "internal_error", message: err.message || "internal server error" } }, 500);
  });
}
