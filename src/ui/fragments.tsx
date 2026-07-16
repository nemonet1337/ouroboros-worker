/**
 * /ui/fragments — htmx 用の HTML フラグメントルート。
 *
 * GUI の各ウィジェット（ダッシュボード統計・各種一覧・フォーム結果）は
 * このルート群から HTML を受け取って DOM にスワップする。JSON REST API
 * (/api/v1) はプログラム連携用としてレスポンスを一切変えずに残し、
 * データ取得・実行ロジックは src/http/data.ts と各リポジトリを共有する。
 *
 * 認証はセッション Cookie のみ（Bearer トークンは受け付けない）。
 * 未認証時は HX-Redirect ヘッダーでログイン画面へ遷移させる。
 */
import { Hono, type Context, type Next } from "hono";
import { getCookie } from "hono/cookie";
import type { FC } from "hono/jsx";
import type { Ports } from "../ports";
import type { HealingConfig } from "../config/healing.config";
import type { AuthService, AuthedUser } from "../auth/service";
import type { Logger } from "../logging/logger";
import type { TriggerHealingResult } from "../http/api";
import type { InspectionRequest, InspectionResult, Language } from "../types";
import { FlagService, FLAGS } from "../flags/flag.service";
import { parseScopes, type Scope } from "../auth/tokens";
import {
  InspectionRepository,
  WebhookRepository,
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
  RefactorRepository,
} from "../db/repositories";
import {
  buildMetricsData,
  loadPublicConfig,
  parseHistoryEntry,
  runUserInspection,
  shapeWebhookRow,
} from "../http/data";
import { validateWebhookUrl } from "../webhook/url.guard";
import { webhookCreateSchema, codeSessionCreateSchema } from "../http/validation";
import { newId } from "../auth/tokens";
import { CodeSessionManager } from "../code/session.manager";
import { MetricsDashboard } from "./components/metrics-dashboard";
import { PRHistory } from "./components/pr-history";
import { InspectionHistoryList } from "./components/inspection-history-list";
import { InspectionDetail } from "./components/inspection-detail";
import { CodeSessionList } from "./components/code-session-list";
import { ProposalList } from "./components/proposal-list";
import { WebhookList } from "./components/webhook-list";
import { TokenList } from "./components/token-list";
import { HealingRunList } from "./components/healing-run-list";
import { RegistrationToggle, LogFileList, LogFileViewer, ConfigView } from "./components/admin-fragments";

const SESSION_COOKIE = "ouro_session";

export interface FragmentDeps {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  flags?: FlagService;
  /** 環境変数 OURO_REGISTRATION_ENABLED による上書き。未設定なら DB 設定に従う。 */
  registrationEnabled?: boolean;
  githubTokenSet?: boolean;
  triggerHealing: (opts: { trigger: string; userId?: string; dryRun: boolean }) => Promise<TriggerHealingResult>;
}

type Env = { Variables: { identity: { user: AuthedUser } } };

// ─── 共通アラートフラグメント ──────────────────────────────────────────────────

const Alert: FC<{ type: "success" | "error" | "info"; message: string; children?: unknown }> = ({
  type,
  message,
  children,
}) => {
  const cls = type === "success" ? "alert-success" : type === "error" ? "alert-error" : "alert-info";
  const icon = type === "success" ? "check-circle" : type === "error" ? "alert-circle" : "info";
  return (
    <div class={`alert ${cls} rounded-lg flex items-center gap-2`}>
      <i data-lucide={icon} class="w-5 h-5" />
      <span>
        {message}
        {children}
      </span>
    </div>
  );
};

// 検査フォームの言語 → スニペットファイル拡張子
const LANGUAGE_EXT: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  rust: "rs",
  go: "go",
  java: "java",
  csharp: "cs",
  cpp: "cpp",
  ruby: "rb",
  flutter: "dart",
  php: "php",
  swift: "swift",
};

export function createFragments(deps: FragmentDeps): Hono<Env> {
  const { ports, auth } = deps;
  const app = new Hono<Env>();

  const inspections = new InspectionRepository(ports.db);
  const webhooks = new WebhookRepository(ports.db);
  const runs = new HealingRunRepository(ports.db);
  const settingsRepo = new SettingsRepository(ports.db);
  const codeSessions = new CodeSessionRepository(ports.db);
  const refactorRepo = new RefactorRepository(ports.db);
  const codeManager = new CodeSessionManager(ports.db, ports.codeRunner, ports.ai);
  const log = deps.logger.child("fragments");

  // 失敗時も生の JSON/スタックではなく alert フラグメントを返す。
  // Hono はハンドラの例外を最内フレームで即座に onError へ渡すため、
  // ミドルウェアの try/catch では捕捉できない。サブアプリのカスタム onError は
  // route() マウント後も各ルートをラップして適用される。
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : String(err);
    return c.html(<Alert type="error" message={`処理に失敗しました: ${message}`} />);
  });

  // セッション Cookie 認証（Bearer トークンは不可）
  app.use("*", async (c, next) => {
    const sid = getCookie(c, SESSION_COOKIE);
    const user = sid ? await auth.resolveSession(sid) : undefined;
    if (!user) {
      c.header("HX-Redirect", "/login");
      return c.body(null, 401);
    }
    c.set("identity", { user });
    await next();
  });

  const requireAdmin = async (c: Context<Env>, next: Next) => {
    if (c.get("identity").user.role !== "admin") {
      return c.html(<Alert type="error" message="管理者権限が必要です。" />, 403);
    }
    await next();
  };

  const requireFlag = (flagName: string, defaultValue: boolean) => async (c: Context<Env>, next: Next) => {
    if (deps.flags) {
      const enabled = await deps.flags.get(flagName, defaultValue);
      if (!enabled) {
        return c.html(<Alert type="info" message="この機能は現在無効化されています。" />);
      }
    }
    await next();
  };

  // ── ダッシュボード ─────────────────────────────────────────────────────────
  app.get("/metrics", async (c) => {
    const data = await buildMetricsData(inspections, runs, c.get("identity").user.id);
    return c.html(<MetricsDashboard data={data} />);
  });

  app.get("/prs", async (c) => {
    const perPage = 10;
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const data = await buildMetricsData(inspections, runs, c.get("identity").user.id);
    const items = data.prHistory.slice((page - 1) * perPage, page * perPage).map((pr) => ({
      number: pr.number,
      title: pr.title,
      branch: pr.branch,
      status: pr.status,
      created_at: pr.date,
    }));
    return c.html(<PRHistory items={items} page={page} perPage={perPage} />);
  });

  // ── Inspection ────────────────────────────────────────────────────────────
  app.get("/history", async (c) => {
    const rows = await inspections.listByUser(c.get("identity").user.id, 50);
    return c.html(<InspectionHistoryList history={rows.map((r) => parseHistoryEntry(r)).reverse()} />);
  });

  app.get("/inspections/:id", async (c) => {
    const row = await inspections.find(c.req.param("id")!, c.get("identity").user.id);
    if (!row) return c.html(<Alert type="error" message="検査結果が見つかりません。" />);
    let result: InspectionResult;
    try {
      result = JSON.parse(row.result);
    } catch {
      return c.html(<Alert type="error" message="検査結果の読み込みに失敗しました。" />);
    }
    return c.html(<InspectionDetail result={result} />);
  });

  app.post("/inspect", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody();
    const language = typeof body.language === "string" ? body.language : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!language || !code.trim()) {
      return c.html(<Alert type="error" message="対象言語とソースコードを入力してください。" />);
    }
    const req: InspectionRequest = {
      id: newId(),
      language: language as Language,
      files: [{ path: `snippet.${LANGUAGE_EXT[language] ?? "txt"}`, content: code }],
      requestedAt: new Date().toISOString(),
    };
    const outcome = await runUserInspection({ ports, inspections, auth, log, userId, req });
    if (!outcome.ok) {
      return c.html(<Alert type="error" message={`解析に失敗しました: ${outcome.message}`} />);
    }
    return c.html(<InspectionDetail result={outcome.result} />);
  });

  // ── Code モード ───────────────────────────────────────────────────────────
  app.get("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const rows = await codeSessions.listByUser(c.get("identity").user.id);
    return c.html(<CodeSessionList sessions={rows} />);
  });

  app.post("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const body = await c.req.parseBody();
    const check = codeSessionCreateSchema(body);
    if (!check.ok) {
      return c.html(<Alert type="error" message={`入力内容を確認してください: ${check.errors.join(", ")}`} />);
    }
    const v = check.value;
    const id = await codeManager.create({
      userId: c.get("identity").user.id,
      repoUrl: v.repoUrl,
      branch: v.branch ?? "main",
      baseBranch: v.baseBranch ?? "main",
      title: v.title,
      instruction: v.instruction,
    });
    c.header("HX-Redirect", `/code/sessions/${id}`);
    return c.html("");
  });

  app.post("/code/sessions/:id/generate", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const model = await auth.resolveModel(userId, "coding");
    const planModel = await auth.resolveModel(userId, "plan");
    await codeManager.generate(c.req.param("id")!, userId, { model, planModel });
    return c.html(
      <Alert type="success" message="パッチを生成しました。「状態を更新」を押して内容を確認してください。" />
    );
  });

  app.post("/code/sessions/:id/apply", requireFlag(FLAGS.CODE_FIX_COMPLETE, true), async (c) => {
    const userId = c.get("identity").user.id;
    const result = await codeManager.apply(c.req.param("id")!, userId, ports.vcs);
    return c.html(
      <Alert type="success" message="PR を作成しました: ">
        <a href={result.prUrl} target="_blank" class="link font-mono font-bold">
          #{result.prNumber}
        </a>
      </Alert>
    );
  });

  // ── Refactor モード ───────────────────────────────────────────────────────
  app.get("/refactor/proposals", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const rows = await refactorRepo.listProposals(c.get("identity").user.id);
    return c.html(<ProposalList proposals={rows} />);
  });

  // ── Webhook ───────────────────────────────────────────────────────────────
  const renderWebhookList = async (userId: string, oob = false) => {
    const rows = await webhooks.listByUser(userId);
    return <WebhookList webhooks={rows.map(shapeWebhookRow)} oob={oob} />;
  };

  app.get("/webhooks", async (c) => c.html(await renderWebhookList(c.get("identity").user.id)));

  app.post("/webhooks", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody();
    const check = webhookCreateSchema(body);
    if (!check.ok) {
      return c.html(<Alert type="error" message={`入力内容を確認してください: ${check.errors.join(", ")}`} />);
    }
    const v = check.value as Record<string, unknown>;
    const configData = {
      name: (typeof v.name === "string" && v.name) || "webhook",
      adapter: (typeof v.adapter === "string" && v.adapter) || "generic",
      events: ["inspection.completed"],
      secret: "",
      scoreThresholds: { overall: 70 },
    };
    await webhooks.insert({
      id: newId(),
      user_id: userId,
      url: v.url as string,
      type: configData.adapter,
      enabled: v.enabled === "on" || v.enabled === "true" ? 1 : 0,
      config: JSON.stringify(configData),
      created_at: Date.now(),
    });
    return c.html(
      <>
        <Alert type="success" message="Webhook を登録しました。" />
        {await renderWebhookList(userId, true)}
      </>
    );
  });

  app.post("/webhooks/:id/toggle", async (c) => {
    const userId = c.get("identity").user.id;
    const hook = (await webhooks.listByUser(userId)).find((w) => w.id === c.req.param("id"));
    if (hook) await webhooks.setEnabled(hook.id, userId, hook.enabled !== 1);
    return c.html(await renderWebhookList(userId));
  });

  app.post("/webhooks/:id/delete", async (c) => {
    const userId = c.get("identity").user.id;
    await webhooks.delete(c.req.param("id")!, userId);
    return c.html(await renderWebhookList(userId));
  });

  app.post("/webhooks/:id/test", async (c) => {
    const userId = c.get("identity").user.id;
    const hook = (await webhooks.listByUser(userId)).find((w) => w.id === c.req.param("id"));
    if (!hook) return c.html(<Alert type="error" message="Webhook が見つかりません。" />);
    try {
      validateWebhookUrl(hook.url);
    } catch (err) {
      return c.html(<Alert type="error" message={`宛先 URL が不正です: ${(err as Error).message}`} />);
    }
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "ouroboros-webhook-test" },
        body: JSON.stringify({ event: "test", message: "Ouroboros webhook test", at: new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? (
        c.html(<Alert type="success" message={`テスト送信に成功しました (HTTP ${res.status})。`} />)
      ) : (
        c.html(<Alert type="error" message={`テスト送信が拒否されました (HTTP ${res.status})。`} />)
      );
    } catch (err) {
      return c.html(<Alert type="error" message={`テスト送信に失敗しました: ${(err as Error).message}`} />);
    }
  });

  // ── API トークン ──────────────────────────────────────────────────────────
  app.get("/tokens", async (c) =>
    c.html(<TokenList tokens={await auth.listTokens(c.get("identity").user.id)} />)
  );

  app.post("/tokens", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody({ all: true });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return c.html(<Alert type="error" message="トークン識別名を入力してください。" />);

    const rawScopes = Array.isArray(body.scopes) ? body.scopes : body.scopes ? [body.scopes] : [];
    const scopes = rawScopes.filter((s): s is Scope => typeof s === "string" && parseScopes(s).length > 0);

    const rawDays = typeof body.expiresInDays === "string" ? Number.parseInt(body.expiresInDays, 10) : NaN;
    const expiresInDays = Number.isFinite(rawDays) && rawDays >= 1 ? Math.min(rawDays, 365) : undefined;

    const created = await auth.createToken(userId, name, scopes.length ? scopes : ["read"], expiresInDays);
    return c.html(
      <>
        {/* シークレットはここで一度だけ表示される */}
        <div class="card card-glass border border-emerald-500/30 p-4 space-y-3">
          <div class="flex items-center gap-2 text-sm font-bold text-emerald-500">
            <i data-lucide="check-circle" class="w-4 h-4" />
            <span>トークンを生成しました</span>
          </div>
          <p class="text-xs opacity-60">
            このシークレットは今回しか表示されません。安全な場所にコピーして保管してください。
          </p>
          <div class="flex items-center gap-2">
            <code
              id="new-token-secret"
              class="flex-1 font-mono text-xs px-3 py-2 rounded-lg bg-base-200 border border-[var(--glass-border)] break-all select-all"
            >
              {created.secret}
            </code>
            <button
              type="button"
              class="btn btn-sm btn-outline rounded-lg gap-1"
              onclick="navigator.clipboard.writeText(document.getElementById('new-token-secret').textContent)"
            >
              <i data-lucide="copy" class="w-3.5 h-3.5" />
              <span>コピー</span>
            </button>
          </div>
        </div>
        <TokenList tokens={await auth.listTokens(userId)} oob />
      </>
    );
  });

  app.post("/tokens/:id/revoke", async (c) => {
    const userId = c.get("identity").user.id;
    await auth.revokeToken(userId, c.req.param("id")!);
    return c.html(<TokenList tokens={await auth.listTokens(userId)} />);
  });

  // ── 自己修復 ──────────────────────────────────────────────────────────────
  app.get("/healing/runs", async (c) => c.html(<HealingRunList runs={await runs.recent(50)} />));

  app.post("/healing", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const dryRun = (body as Record<string, unknown>).dryRun === "true";
    const out = await deps.triggerHealing({ trigger: "gui", userId, dryRun });
    return c.html(
      <>
        <Alert
          type="success"
          message={
            dryRun
              ? `ドライランを開始しました (実行 ID: ${out.runId.slice(0, 8)})。変更は適用されません。`
              : `自己修復サイクルを開始しました (実行 ID: ${out.runId.slice(0, 8)})。`
          }
        />
        <HealingRunList runs={await runs.recent(50)} oob />
      </>
    );
  });

  // ── プロファイル ──────────────────────────────────────────────────────────
  app.put("/profile", async (c) => {
    const userId = c.get("identity").user.id;
    const body = await c.req.parseBody();
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" && body.password.length > 0 ? body.password : undefined;
    await auth.updateProfile(userId, email, password);
    return c.html(<Alert type="success" message="プロファイルを更新しました。" />);
  });

  // ── 管理者 ────────────────────────────────────────────────────────────────
  const renderRegistrationToggle = async () => {
    const firstUser = (await auth.userCount()) === 0;
    const envOverride = deps.registrationEnabled !== undefined;
    const enabled = envOverride ? deps.registrationEnabled! : await auth.isRegistrationEnabled();
    return <RegistrationToggle enabled={enabled} firstUser={firstUser} envOverride={envOverride} />;
  };

  app.get("/admin/registration", requireAdmin, async (c) => c.html(await renderRegistrationToggle()));

  app.post("/admin/registration/toggle", requireAdmin, async (c) => {
    if (deps.registrationEnabled === undefined) {
      const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      await auth.setRegistrationEnabled((body as Record<string, unknown>).enabled === "on");
    }
    return c.html(await renderRegistrationToggle());
  });

  app.get("/admin/logs", requireAdmin, async (c) => c.html(<LogFileList files={await ports.logs.list()} />));

  app.get("/admin/logs/:file", requireAdmin, async (c) => {
    const file = c.req.param("file")!;
    const content = await ports.logs.read(file, 200_000).catch(() => "");
    return c.html(<LogFileViewer file={file} content={content} />);
  });

  app.get("/admin/config", requireAdmin, async (c) => {
    const config = await loadPublicConfig(settingsRepo, deps.config.vcs, deps.githubTokenSet ?? false);
    return c.html(<ConfigView config={config} />);
  });

  return app;
}
