import { Hono, type Context, type Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Ports } from "../ports";
import type { AiModelInfo } from "../ports/ai";
import type { HealingConfig } from "../config/healing.config";
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_WORKERS_AI_MODEL, isCompatibleEmbeddingModel } from "../config/deployment";
import { AuthService, AuthError, type AuthedUser } from "../auth/service";
import { newId } from "../auth/tokens";
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
import { sendWebhookTest } from "../webhook/test-send";
import { OPENAPI_SPEC } from "./openapi";
import { CodeSessionManager } from "../code/session.manager";
import { ProposalManager } from "../refactor/proposal.manager";
import { FLAGS, resolveFeatureFlag } from "../flags/flag.service";
import type { VersionMetadata } from "../env";
import {
  validateBody,
  credentialsSchema,
  profileUpdateSchema,
  inspectSchema,
  webhookCreateSchema,
  webhookPatchSchema,
  settingsSchema,
  configSchema,
  codeSessionCreateSchema,
  codeSessionActionSchema,
  modelSchema,
  userModelsSchema,
} from "./validation";
import { CODE_INDEX_STATUS_KEY } from "../vectorize/code.indexer";
import { DEFAULT_APP_SETTINGS, getEmbeddingModel, getSelectedRepo, setEmbeddingModel } from "../config/settings.keys";
import { encrypt } from "../utils/crypto";
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
const DEFAULT_SETTINGS = DEFAULT_APP_SETTINGS;

export interface TriggerHealingResult {
  runId: string;
  workflowId?: string;
}

export interface ApiDeps {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  /** Platform-specific kickoff: Workflow instance (worker). */
  triggerHealing: (opts: { trigger: string; userId?: string; dryRun: boolean }) => Promise<TriggerHealingResult>;
  /** Healing workflow terminate */
  cancelHealing?: (runId: string) => Promise<{ ok: boolean; error?: string }>;
  cookieSecure?: boolean;
  registrationEnabled?: boolean;
  githubTokenSet?: boolean;
  versionMetadata?: VersionMetadata;
  encryptionKey?: string;
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
 * Ouroboros HTTP API (Hono). Mounted at `/api/v1` (and `/api` for compat).
 * Routes are relative to the mount point.
 */
export function createApi(deps: ApiDeps): Hono<Env> {
  const { ports, auth, logger } = deps;
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

  const heavyLimit = async (c: Context<Env>, next: Next) => {
    const identity = c.get("identity");
    const key = identity ? `heavy:${identity.user.id}` : `heavy:ip:${clientIp(c)}`;
    const { success } = await ports.rateLimiter.limit(key);
    if (!success) return c.json({ error: { code: "rate_limited", message: "rate limit exceeded" } }, 429);
    await next();
  };

  // ── Identity resolution (cookie session only) ─────────────────────────────
  app.use("*", async (c: Context<Env>, next: Next) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) {
      const user = await auth.resolveSession(sid);
      if (user) c.set("identity", { user, scopes: "admin" });
    }
    await next();
  });

  const requireAuth = () => async (c: Context<Env>, next: Next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    await next();
  };

  const makeProposalManager = () => {
    const repoUrl = `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    return new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
  };
  const requireAdmin = async (c: Context<Env>, next: Next) => {
    const identity = c.get("identity");
    if (!identity) return c.json({ error: { code: "unauthorized", message: "authentication required" } }, 401);
    if (identity.user.role !== "admin") return c.json({ error: { code: "forbidden", message: "admin only" } }, 403);
    await next();
  };

  const requireFlag = (flagName: string, defaultValue: boolean) => {
    return async (c: Context, next: Next) => {
      const enabled = await resolveFeatureFlag(settingsRepo, flagName, defaultValue);
      if (!enabled) {
        return c.json({ error: { code: "forbidden", message: `Feature ${flagName} is disabled` } }, 403);
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
      deployTarget: "cloudflare",
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
          // テンプレート文字列で HTML を組み立てず、text として返す（XSS 防止）
          return c.text(err.message, 400);
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
          return c.text(err.message, 400);
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
    return c.json({ deployTarget: "cloudflare", provider, models });
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

  // ── AI モデル設定（テキスト生成はユーザー単位、Embedding はシステム全体） ──
  app.get("/settings/models", requireAuth(), async (c) => {
    const user = c.get("identity")!.user;
    const model = await auth.getModel(user.id);
    const embeddingModel = await getEmbeddingModel(settingsRepo);
    return c.json({
      model,
      embeddingModel,
      effectiveModel: model ?? DEFAULT_WORKERS_AI_MODEL,
      effectiveEmbeddingModel: embeddingModel,
      defaults: { model: DEFAULT_WORKERS_AI_MODEL, embeddingModel: DEFAULT_EMBEDDING_MODEL },
    });
  });

  app.put("/settings/models", requireAuth(), validateBody(userModelsSchema), async (c) => {
    const user = c.get("identity")!.user;
    const body = c.get("body") as { model?: string; embeddingModel?: string };
    if (body.model !== undefined) {
      await auth.setModel(user.id, body.model === "" ? null : body.model);
    }
    if (body.embeddingModel !== undefined) {
      if (user.role !== "admin") {
        if (c.req.header("HX-Request")) {
          return c.html(
            `<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>Embedding モデルの変更は管理者のみです。</span></div><script>lucide.createIcons()</script>`,
            403
          );
        }
        return c.json({ error: { code: "forbidden", message: "embedding model is admin-only" } }, 403);
      }
      if (body.embeddingModel !== "") {
        let dims: number | undefined;
        try {
          const listed = (await ports.ai.listModels?.()) ?? [];
          dims = listed.find((m) => m.value === body.embeddingModel)?.outputDimensions;
        } catch {
          dims = undefined;
        }
        if (!isCompatibleEmbeddingModel(body.embeddingModel, dims)) {
          const msg = `"${body.embeddingModel}" は Vectorize（768 次元）と互換がありません。`;
          if (c.req.header("HX-Request")) {
            return c.html(
              `<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>${msg}</span></div><script>lucide.createIcons()</script>`,
              400
            );
          }
          return c.json({ error: { code: "incompatible_embedding", message: msg } }, 400);
        }
      }
      await setEmbeddingModel(settingsRepo, body.embeddingModel === "" ? null : body.embeddingModel);
    }
    if (c.req.header("HX-Request")) {
      const savedEmbedding = body.embeddingModel !== undefined && user.role === "admin";
      const extra = savedEmbedding
        ? " Embedding を変えた場合はコードインデックスの再構築が必要です。"
        : "";
      return c.html(
        `<div class="alert alert-success rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i><span>モデル設定を保存しました。${extra}</span></div><script>lucide.createIcons()</script>`
      );
    }
    return c.json({ ok: true });
  });

  // ── コードインデックス（Vectorize RAG）────────────────────────────────────
  app.post("/code-index/reindex", requireAdmin, heavyLimit, async (c) => {
    if (!ports.vectorize) {
      return c.json(
        { error: { code: "not_configured", message: "VECTORIZE binding is not configured" } },
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
  app.post("/inspect", requireAuth(), heavyLimit, validateBody(inspectSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const req = c.get("body") as InspectionRequest;
    const outcome = await runUserInspection({ ports, inspections, auth, log, userId, req });
    if (!outcome.ok) {
      return c.json({ error: { code: outcome.code, message: outcome.message } }, outcome.status);
    }
    return c.json(outcome.result);
  });

  app.post("/inspect/:id/cancel", requireAuth(), async (c) => {
    const userId = c.get("identity")!.user.id;
    const id = c.req.param("id")!;
    const row = await inspections.find(id, userId);
    if (!row) return c.json({ error: { code: "not_found", message: "inspection not found" } }, 404);
    const active = ["queued", "indexing", "searching", "analyzing"];
    if (!active.includes(row.status)) {
      return c.json({ error: { code: "not_active", message: `cannot cancel status: ${row.status}` } }, 400);
    }
    await inspections.updateStatus(id, userId, "canceled");
    return c.json({ ok: true, status: "canceled" });
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
    try {
      validateWebhookUrl(body.url);
    } catch (err) {
      return c.json({ error: { code: "invalid_url", message: (err as Error).message } }, 400);
    }

    const encKey = deps.encryptionKey ?? "";
    if (body.secret && !encKey) {
      return c.json({ error: { code: "misconfigured", message: "OURO_ENCRYPTION_KEY is not set" } }, 500);
    }
    const secret = body.secret ? await encrypt(String(body.secret), encKey) : "";
    const configData = {
      name: body.name || "webhook",
      adapter: body.adapter || body.type || "generic",
      events: body.events || ["inspection.completed"],
      secret,
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

    if (body.url !== undefined) {
      try {
        validateWebhookUrl(body.url);
      } catch (err) {
        return c.json({ error: { code: "invalid_url", message: (err as Error).message } }, 400);
      }
    }

    if (body.enabled !== undefined) {
      await webhooks.setEnabled(hookId, userId, body.enabled);
    }

    const rows = await webhooks.listByUser(userId);
    const existing = rows.find((r) => r.id === hookId);

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
      if (body.secret !== undefined) {
        const encKey = deps.encryptionKey ?? "";
        if (body.secret && !encKey) {
          return c.json({ error: { code: "misconfigured", message: "OURO_ENCRYPTION_KEY is not set" } }, 500);
        }
        cfg.secret = body.secret ? await encrypt(String(body.secret), encKey) : "";
      }

      const updates: string[] = [];
      const params: any[] = [];
      if (body.url !== undefined) {
        updates.push("url = ?");
        params.push(body.url);
      }
      if (body.type !== undefined) {
        updates.push("type = ?");
        params.push(body.type);
      }

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

  app.post("/webhooks/:id/test", requireAuth(), async (c) => {
    const list = await webhooks.listByUser(c.get("identity")!.user.id);
    const hook = list.find((w) => w.id === c.req.param("id"));
    if (!hook) return c.json({ error: { code: "not_found", message: "webhook not found" } }, 404);
    const result = await sendWebhookTest(hook.url);
    if (result.error && result.status === undefined) {
      return c.json({ success: false, error: result.error }, result.ok ? 200 : 400);
    }
    return c.json({ success: result.ok, statusCode: result.status, error: result.error });
  });

  // ── Self-healing ─────────────────────────────────────────────────────────
  app.post("/healing", requireAuth(), heavyLimit, async (c) => {
    const body = await c.req.json<{ dryRun?: boolean }>().catch(() => ({ dryRun: false }));
    const out = await deps.triggerHealing({
      trigger: "api",
      userId: c.get("identity")!.user.id,
      dryRun: body.dryRun ?? false,
    });
    return c.json(out, 202);
  });

  app.post("/healing/:runId/cancel", requireAuth(), async (c) => {
    const runId = c.req.param("runId")!;
    if (!deps.cancelHealing) {
      return c.json({ error: { code: "not_supported", message: "cancel not available" } }, 503);
    }
    const result = await deps.cancelHealing(runId);
    if (!result.ok) {
      return c.json({ error: { code: "cancel_failed", message: result.error ?? "cancel failed" } }, 400);
    }
    return c.json({ ok: true, status: "canceled" });
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

  app.post("/code/sessions", requireAuth(), requireFlag(FLAGS.CODE_NEEDS_FIX, true), validateBody(codeSessionCreateSchema), async (c) => {
    const userId = c.get("identity")!.user.id;
    const body = c.get("body") as { repoUrl?: string; branch?: string; baseBranch?: string; title: string; instruction: string };
    let repoUrl = body.repoUrl;
    if (!repoUrl) {
      const selected = await getSelectedRepo(settingsRepo);
      if (!selected) {
        return c.json({ error: { code: "no_repo_selected", message: "no repository selected; set one in the dashboard" } }, 400);
      }
      repoUrl = `https://github.com/${selected.owner}/${selected.repo}`;
    }
    const id = await codeManager.create({
      userId,
      repoUrl,
      branch: body.branch ?? "main",
      baseBranch: body.baseBranch ?? "main",
      title: body.title,
      instruction: body.instruction,
    });
    return c.json({ id }, 201);
  });

  app.post(
    "/code/sessions/:id/generate",
    requireAuth(),
    heavyLimit,
    requireFlag(FLAGS.CODE_NEEDS_FIX, true),
    validateBody(codeSessionActionSchema),
    async (c) => {
      const userId = c.get("identity")!.user.id;
      const sessionId = c.req.param("id")!;
      const row = await codeManager.get(sessionId, userId);
      if (!row) return c.json({ error: { code: "not_found", message: "session not found" } }, 404);
      if (row.status !== "ready" && row.status !== "failed") {
        return c.json({ error: { code: "invalid_status", message: `cannot generate from status: ${row.status}` } }, 400);
      }
      // 同期 AI 呼び出しを避け、Queue で非同期実行
      await ports.db.exec(
        `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        ["generating", Date.now(), sessionId, userId]
      );
      await ports.queue.send({
        id: newId(),
        type: "codegen.requested",
        userId,
        payload: { sessionId, mode: "plan_code" },
        enqueuedAt: Date.now(),
      });
      return c.json({ ok: true, status: "generating" }, 202);
    }
  );

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
    const manager = makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.generateProposal(c.req.param("inspectionId")!, userId, model);
    return c.json({ ok: true });
  });

  app.post("/refactor/proposals/:inspectionId/apply", requireAuth(), requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const manager = makeProposalManager();
    const model = await auth.resolveModel(userId);
    const result = await manager.applyProposal(c.req.param("inspectionId")!, userId, ports.codeRunner, model);
    return c.json(result);
  });

  app.post("/refactor/proposals/:inspectionId/dismiss", requireAuth(), requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity")!.user.id;
    const manager = makeProposalManager();
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
  const api = createApi(deps);
  root.route("/api/v1", api);
  root.route("/api", api);

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
