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
import {
  InspectionRepository,
  WebhookRepository,
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
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
import { ProposalManager } from "../refactor/proposal.manager";
import { MetricsDashboard } from "./components/metrics-dashboard";
import { PRHistory } from "./components/pr-history";
import { InspectionHistoryList } from "./components/inspection-history-list";
import { InspectionDetail } from "./components/inspection-detail";
import { InspectionProgress } from "./components/inspection-progress";
import { CodeSessionList } from "./components/code-session-list";
import { WebhookList } from "./components/webhook-list";
import { HealingRunList } from "./components/healing-run-list";
import { RepoSelector } from "./components/repo-selector";
import { RegistrationToggle, LogFileList, LogFileViewer, ConfigView } from "./components/admin-fragments";
import { resolveFeatureFlag } from "../flags/flag.service";
import { getSelectedRepo, setSelectedRepo, setWebhooksEnabled, setFeatureFlags } from "../config/settings.keys";

const SESSION_COOKIE = "ouro_session";
const APP_SETTINGS_KEY = "app_settings";

// GUI で切り替え可能な機能トグル一覧（settings.tsx の FEATURE_TOGGLES と対応）
const SYSTEM_FEATURE_FLAGS: string[] = [
  FLAGS.CODE_NEEDS_FIX,
  FLAGS.CODE_FIX_COMPLETE,
  FLAGS.REFACTOR_APPROVED,
  FLAGS.REFACTOR_APPLIED,
];

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
    const enabled = await resolveFeatureFlag(settingsRepo, deps.flags, flagName, defaultValue);
    if (!enabled) {
      return c.html(<Alert type="info" message="この機能は現在無効化されています。" />);
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

  // ── リポジトリ選択（システム全体で 1 つ） ─────────────────────────────────
  app.get("/repos", async (c) => {
    const selected = await getSelectedRepo(settingsRepo);
    let repos: Awaited<ReturnType<NonNullable<typeof ports.vcs.listRepos>>> = [];
    try {
      repos = ports.vcs.listRepos ? await ports.vcs.listRepos() : [];
    } catch {
      // 一覧取得に失敗しても手動入力は可能
    }
    return c.html(<RepoSelector repos={repos} selected={selected} />);
  });

  app.post("/repos/select", async (c) => {
    const body = await c.req.parseBody();
    const repo = typeof body.repo === "string" ? body.repo.trim() : "";
    let selected: { owner: string; repo: string } | null;
    let error: string | undefined;
    try {
      selected = await setSelectedRepo(settingsRepo, repo);
    } catch (err) {
      selected = await getSelectedRepo(settingsRepo);
      error = (err as Error).message;
    }
    let repos: Awaited<ReturnType<NonNullable<typeof ports.vcs.listRepos>>> = [];
    try {
      repos = ports.vcs.listRepos ? await ports.vcs.listRepos() : [];
    } catch {
      // ignore
    }
    return c.html(<RepoSelector repos={repos} selected={selected} error={error} />);
  });

  // ── Inspection ────────────────────────────────────────────────────────────
  app.get("/history", async (c) => {
    const rows = await inspections.listByUser(c.get("identity").user.id, 50);
    return c.html(<InspectionHistoryList history={rows.map((r) => parseHistoryEntry(r)).reverse()} />);
  });

  app.get("/inspections/:id", async (c) => {
    const userId = c.get("identity").user.id;
    const row = await inspections.find(c.req.param("id")!, userId);
    if (!row) return c.html(<Alert type="error" message="検査結果が見つかりません。" />);

    // 進行中（queued/indexing/searching/analyzing）は進捗を表示してポーリング継続
    if (row.status !== "completed" && row.status !== "proposed" && row.status !== "applied" && row.status !== "dismissed") {
      let steps: { step: string; message: string; at: number }[] = [];
      try {
        steps = row.progress ? JSON.parse(row.progress) : [];
      } catch {
        steps = [];
      }
      return c.html(<InspectionProgress id={row.id} status={row.status} steps={steps} />);
    }

    let result: InspectionResult;
    try {
      result = JSON.parse(row.result);
    } catch {
      return c.html(<Alert type="error" message="検査結果の読み込みに失敗しました。" />);
    }
    return c.html(<InspectionDetail result={result} inspectionId={row.id} status={row.status} />);
  });

  app.post("/inspect", async (c) => {
    const userId = c.get("identity").user.id;
    const selected = await getSelectedRepo(settingsRepo);
    if (!selected) {
      return c.html(
        <Alert type="error" message="対象リポジトリが選択されていません。ダッシュボードでリポジトリを選択してください。" />
      );
    }
    const body = await c.req.parseBody();
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";

    // 日次クォータ / レート制限チェック
    const { success: rlOk } = await ports.rateLimiter.limit(`inspect:${userId}`);
    if (!rlOk) {
      return c.html(<Alert type="error" message="レート制限を超過しました。時間をおいて再度お試しください。" />);
    }

    // queued 状態の inspection 行を作成
    const inspectionId = newId();
    await inspections.insert({
      id: inspectionId,
      user_id: userId,
      target: `${selected.owner}/${selected.repo}`,
      result: "{}",
      status: "queued",
      progress: JSON.stringify([{ step: "queued", message: "解析をキューに登録しました。", at: Date.now() }]),
      created_at: Date.now(),
    });

    await ports.queue.send({
      id: newId(),
      type: "inspection.requested",
      userId,
      payload: { inspectionId, instruction },
      enqueuedAt: Date.now(),
    });

    // 進捗をポーリング表示
    return c.html(
      <InspectionProgress
        id={inspectionId}
        status="queued"
        steps={[{ step: "queued", message: "解析をキューに登録しました。", at: Date.now() }]}
      />
    );
  });

  // ── Code モード ───────────────────────────────────────────────────────────
  app.get("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const rows = await codeSessions.listByUser(c.get("identity").user.id);
    return c.html(<CodeSessionList sessions={rows} />);
  });

  app.post("/code/sessions", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const selected = await getSelectedRepo(settingsRepo);
    if (!selected) {
      return c.html(
        <Alert type="error" message="対象リポジトリが選択されていません。ダッシュボードでリポジトリを選択してください。" />
      );
    }
    const body = await c.req.parseBody();
    const check = codeSessionCreateSchema(body);
    if (!check.ok) {
      return c.html(<Alert type="error" message={`入力内容を確認してください: ${check.errors.join(", ")}`} />);
    }
    const v = check.value;
    const id = await codeManager.create({
      userId: c.get("identity").user.id,
      repoUrl: `https://github.com/${selected.owner}/${selected.repo}`,
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
    const body = await c.req.parseBody();
    const mode = body.codeMode === "code_only" ? "code_only" : "plan_code";
    await codeManager.generate(c.req.param("id")!, userId, { model, planModel, mode });
    const updated = await codeManager.get(c.req.param("id")!, userId);
    if (updated && updated.status === "failed") {
      return c.html(
        <Alert type="error" message={`パッチ生成に失敗しました: ${updated.error_message ?? "不明なエラー"}`} />
      );
    }
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

  // ── Refactor モード（提案の生成/適用/却下は Inspection 詳細に統合） ────────
  const renderInspectionDetail = async (c: Context<Env>, inspectionId: string) => {
    const userId = c.get("identity").user.id;
    const row = await inspections.find(inspectionId, userId);
    if (!row) return c.html(<Alert type="error" message="検査結果が見つかりません。" />);
    let result: InspectionResult;
    try {
      result = JSON.parse(row.result);
    } catch {
      return c.html(<Alert type="error" message="検査結果の読み込みに失敗しました。" />);
    }
    return c.html(<InspectionDetail result={result} inspectionId={row.id} status={row.status} />);
  };

  app.post("/refactor/:id/propose", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id")!;
    const selected = await getSelectedRepo(settingsRepo);
    const repoUrl = selected
      ? `https://github.com/${selected.owner}/${selected.repo}`
      : `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    const model = await auth.resolveModel(userId, "refactor");
    await manager.generateProposal(inspectionId, userId, model);
    return renderInspectionDetail(c, inspectionId);
  });

  app.post("/refactor/:id/apply", requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id")!;
    const selected = await getSelectedRepo(settingsRepo);
    const repoUrl = selected
      ? `https://github.com/${selected.owner}/${selected.repo}`
      : `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    const model = await auth.resolveModel(userId, "refactor");
    await manager.applyProposal(inspectionId, userId, ports.codeRunner, model);
    return renderInspectionDetail(c, inspectionId);
  });

  app.post("/refactor/:id/dismiss", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id")!;
    const selected = await getSelectedRepo(settingsRepo);
    const repoUrl = selected
      ? `https://github.com/${selected.owner}/${selected.repo}`
      : `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    const manager = new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
    await manager.dismissProposal(inspectionId, userId);
    return renderInspectionDetail(c, inspectionId);
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
      enabled: 1,
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

  // ── 自己修復 ──────────────────────────────────────────────────────────────
  app.get("/healing/runs", async (c) => c.html(<HealingRunList runs={await runs.recent(50)} />));

  // 修復実行のログ（R2 の healing/<runId>.log をモーダル表示用に取得）
  app.get("/healing/runs/:id/logs", async (c) => {
    const runId = c.req.param("id");
    const run = await runs.find(runId);
    if (!run) return c.html(<Alert type="error" message="実行が見つかりません。" />, 404);
    const file = `healing/${runId}.log`;
    let content = "";
    try {
      content = await ports.logs.read(file);
    } catch {
      content = "";
    }
    const summary = run.summary ? JSON.parse(run.summary as string) : null;
    return c.html(
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold">実行ログ</div>
          <div class="badge badge-sm">{run.status}</div>
        </div>
        {summary && (
          <div class="text-xs opacity-60 font-mono whitespace-pre-wrap break-words">
            {JSON.stringify(summary, null, 2)}
          </div>
        )}
        <pre class="text-xs font-mono leading-relaxed bg-base-200 border border-[var(--glass-border)] rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
          {content || "（ログはまだ出力されていません）"}
        </pre>
      </div>
    );
  });

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

  // ── システム設定（管理者のみ: Webhook/機能トグル/スケジュール） ────────────
  app.put("/system-settings", requireAdmin, async (c) => {
    const body = await c.req.parseBody({ all: true });

    // Webhook 全体スイッチ（チェックボックス: on/未送信）
    await setWebhooksEnabled(settingsRepo, body.webhooksEnabled === "on" || body.webhooksEnabled === "true");

    // 機能トグル（flag:<name> フィールド。フォームはチェック時のみ送信される）
    const flags: Record<string, boolean> = {};
    for (const t of SYSTEM_FEATURE_FLAGS) {
      const raw = body[`flag:${t}`];
      flags[t] = raw === "on" || raw === "true";
    }
    await setFeatureFlags(settingsRepo, flags);

    // 自己修復スケジュール（app_settings.schedule.time = "HH:MM" UTC, daysOfWeek = 曜日番号配列）
    const time = typeof body.scheduleTime === "string" ? body.scheduleTime.trim() : "";
    const days = Array.isArray(body.scheduleDays)
      ? (body.scheduleDays as unknown[])
      : body.scheduleDays !== undefined
        ? [body.scheduleDays]
        : [];
    const daysOfWeek = Array.from(
      new Set(
        days
          .map((d) => Number(d))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      ),
    );
    const raw = await settingsRepo.get(APP_SETTINGS_KEY);
    let appSettings: Record<string, unknown> = {};
    try {
      appSettings = raw ? JSON.parse(raw) : {};
    } catch {}
    const schedule = (appSettings.schedule ?? {}) as Record<string, unknown>;
    schedule.time = /^\d{2}:\d{2}$/.test(time) ? time : "";
    // 空配列（全未選択）は毎日実行を意味するため、保存しない（undefined 扱い）。
    schedule.daysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : undefined;
    appSettings.schedule = schedule;
    await settingsRepo.set(APP_SETTINGS_KEY, JSON.stringify(appSettings));

    return c.html(<Alert type="success" message="システム設定を保存しました。" />);
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
