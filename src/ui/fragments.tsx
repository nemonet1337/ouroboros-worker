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
import type { AiModelInfo } from "../ports/ai";
import type { HealingConfig } from "../config/healing.config";
import type { AuthService, AuthedUser } from "../auth/service";
import type { Logger } from "../logging/logger";
import type { TriggerHealingOpts, TriggerHealingResult } from "../http/api";
import type { InspectionRequest, InspectionResult, Language } from "../types";
import { FLAGS, resolveFeatureFlag } from "../flags/flag.service";
import {
  InspectionRepository,
  HealingRunRepository,
  SettingsRepository,
  CodeSessionRepository,
} from "../db/repositories";
import {
  buildMetricsData,
  loadPublicConfig,
  parseHistoryEntry,
  runUserInspection,
} from "../http/data";
import { codeSessionCreateSchema } from "../http/validation";
import { newId } from "../auth/tokens";
import { CodeSessionManager } from "../code/session.manager";
import { ProposalManager } from "../refactor/proposal.manager";
import { MetricsDashboard } from "./components/metrics-dashboard";
import { PRHistory } from "./components/pr-history";
import { InspectionHistoryList } from "./components/inspection-history-list";
import { InspectionDetail } from "./components/inspection-detail";
import { InspectionProgress } from "./components/inspection-progress";
import { CodeSessionList } from "./components/code-session-list";
import { HealingRunList } from "./components/healing-run-list";
import { HealingFixModalBody } from "./components/healing-fix-modal";
import { RepoSelector } from "./components/repo-selector";
import { NotificationBell, type NotificationItem } from "./components/notification-bell";
import { RegistrationToggle, LogFileList, LogFileViewer, ConfigView } from "./components/admin-fragments";
import { getSelectedRepo, setSelectedRepo, setFeatureFlags } from "../config/settings.keys";
import { ModelPricingPanel } from "./components/model-pricing";

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
  /** 環境変数 OURO_REGISTRATION_ENABLED による上書き。未設定なら DB 設定に従う。 */
  registrationEnabled?: boolean;
  githubTokenSet?: boolean;
  triggerHealing: (opts: TriggerHealingOpts) => Promise<TriggerHealingResult>;
  cancelHealing?: (runId: string) => Promise<{ ok: boolean; error?: string }>;
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
  const runs = new HealingRunRepository(ports.db);
  const settingsRepo = new SettingsRepository(ports.db);
  const codeSessions = new CodeSessionRepository(ports.db);
  const codeManager = new CodeSessionManager(ports.db, ports.codeRunner, ports.ai);
  const log = deps.logger.child("fragments");

  const makeProposalManager = async () => {
    const selected = await getSelectedRepo(settingsRepo);
    const repoUrl = selected
      ? `https://github.com/${selected.owner}/${selected.repo}`
      : `https://github.com/${deps.config.vcs.owner}/${deps.config.vcs.repo}`;
    return new ProposalManager(ports.ai, ports.db, ports.vcs, repoUrl);
  };

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
    const enabled = await resolveFeatureFlag(settingsRepo, flagName, defaultValue);
    if (!enabled) {
      return c.html(<Alert type="info" message="この機能は現在無効化されています。" />);
    }
    await next();
  };

  // ── 進捗通知（ナビバーのベル。全ページから 10 秒間隔でポーリングされる） ──
  const PROGRESS_LABELS: Record<string, string> = {
    queued: "待機中",
    indexing: "インデックス構築中",
    searching: "コード検索中",
    analyzing: "解析中",
    scanning: "スキャン中",
    fixing: "修復中",
    running: "実行中",
    initializing: "初期化中",
    generating: "パッチ生成中",
    applying: "適用中",
  };

  app.get("/notifications", async (c) => {
    const userId = c.get("identity").user.id;
    const [activeInspections, activeRuns, activeSessions] = await Promise.all([
      inspections.listActive(userId),
      runs.listActive(),
      codeSessions.listActive(userId),
    ]);
    const items: NotificationItem[] = [
      ...activeInspections.map((r) => ({
        icon: "scan-search",
        kind: "コード解析",
        title: r.target ?? r.id.slice(0, 8),
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: "/inspection",
        at: r.created_at,
      })),
      ...activeRuns.map((r) => ({
        icon: "wrench",
        kind: "自己修復",
        title: r.id.slice(0, 8),
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: `/healing/${r.id}`,
        at: r.created_at,
      })),
      ...activeSessions.map((r) => ({
        icon: "code",
        kind: "コード編集",
        title: r.title,
        status: PROGRESS_LABELS[r.status] ?? r.status,
        href: `/code/sessions/${r.id}`,
        at: r.created_at,
      })),
    ].sort((a, b) => b.at - a.at);
    return c.html(<NotificationBell items={items} />);
  });

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
    const sessionId = c.req.param("id")!;
    const body = await c.req.parseBody();
    const mode = body.codeMode === "code_only" ? "code_only" : "plan_code";
    const row = await codeManager.get(sessionId, userId);
    if (!row) return c.html(<Alert type="error" message="セッションが見つかりません。" />);
    if (row.status !== "ready" && row.status !== "failed") {
      return c.html(<Alert type="error" message={`現在の状態では生成できません: ${row.status}`} />);
    }
    await ports.db.exec(
      `UPDATE code_sessions SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ["generating", Date.now(), sessionId, userId]
    );
    await ports.queue.send({
      id: newId(),
      type: "codegen.requested",
      userId,
      payload: { sessionId, mode },
      enqueuedAt: Date.now(),
    });
    // ページを generating 状態で再描画し、status poller を起動する
    c.header("HX-Refresh", "true");
    return c.body("");
  });

  /** 生成中ポーリング用ステータスフラグメント */
  app.get("/code/sessions/:id/status", requireFlag(FLAGS.CODE_NEEDS_FIX, true), async (c) => {
    const userId = c.get("identity").user.id;
    const row = await codeManager.get(c.req.param("id")!, userId);
    if (!row) return c.html(<Alert type="error" message="セッションが見つかりません。" />);
    if (row.status === "generating") {
      return c.html(
        <div
          id="code-session-status"
          hx-get={`/ui/fragments/code/sessions/${row.id}/status`}
          hx-trigger="every 5s"
          hx-swap="outerHTML"
        >
          <Alert type="info" message="生成中…（自動更新）" />
        </div>
      );
    }
    if (row.status === "failed" || row.status === "generated") {
      c.header("HX-Refresh", "true");
      return c.body("");
    }
    return c.html(
      <div id="code-session-status">
        <span class="badge badge-ghost">{row.status}</span>
      </div>
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
    const manager = await makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.generateProposal(inspectionId, userId, model);
    return renderInspectionDetail(c, inspectionId);
  });

  app.post("/refactor/:id/apply", requireFlag(FLAGS.REFACTOR_APPLIED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id")!;
    const manager = await makeProposalManager();
    const model = await auth.resolveModel(userId);
    await manager.applyProposal(inspectionId, userId, ports.codeRunner, model);
    return renderInspectionDetail(c, inspectionId);
  });

  app.post("/refactor/:id/dismiss", requireFlag(FLAGS.REFACTOR_APPROVED, true), async (c) => {
    const userId = c.get("identity").user.id;
    const inspectionId = c.req.param("id")!;
    const manager = await makeProposalManager();
    await manager.dismissProposal(inspectionId, userId);
    return renderInspectionDetail(c, inspectionId);
  });

  // ── 自己修復 ──────────────────────────────────────────────────────────────
  const HEALING_RUNS_PER_PAGE = 10;
  const ALLOWED_STATUS_FILTERS = new Set([
    "",
    "active",
    "queued",
    "indexing",
    "scanning",
    "analyzing",
    "analyzed",
    "fixing",
    "running",
    "done",
    "failed",
    "canceled",
  ]);

  const parseStatusFilter = (raw: string | undefined): string => {
    const s = (raw ?? "").trim();
    return ALLOWED_STATUS_FILTERS.has(s) ? s : "";
  };

  const renderHealingRuns = async (page: number, statusFilter = "", oob = false) => {
    // perPage+1 件取得して次ページ有無を判定する
    const rows = await runs.recent(
      HEALING_RUNS_PER_PAGE + 1,
      (page - 1) * HEALING_RUNS_PER_PAGE,
      statusFilter || undefined
    );
    return (
      <HealingRunList
        runs={rows.slice(0, HEALING_RUNS_PER_PAGE)}
        page={page}
        hasNext={rows.length > HEALING_RUNS_PER_PAGE}
        statusFilter={statusFilter}
        oob={oob}
      />
    );
  };

  app.get("/healing/runs", async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query("page") ?? "1", 10) || 1);
    const statusFilter = parseStatusFilter(c.req.query("status"));
    return c.html(await renderHealingRuns(page, statusFilter));
  });

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
    let summary: unknown = null;
    if (run.summary) {
      try {
        summary = JSON.parse(run.summary);
      } catch {
        summary = run.summary;
      }
    }
    const statusLabel =
      (
        {
          queued: "待機中",
          scanning: "スキャン中",
          indexing: "インデックス中",
          analyzing: "解析中",
          analyzed: "解析完了",
          fixing: "修復中",
          running: "実行中",
          done: "修復完了",
          failed: "失敗",
          canceled: "キャンセル",
        } as Record<string, string>
      )[run.status] ?? run.status;
    const triggerLabel =
      ({ api: "API", gui: "GUI", cron: "スケジュール" } as Record<string, string>)[run.trigger] ??
      run.trigger;
    const startedAt = new Date(run.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    const updatedAt = new Date(run.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    return c.html(
      <div class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-xs opacity-50 mb-0.5">実行 ID</div>
            <div class="font-mono text-xs break-all">{run.id}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 mb-0.5">ステータス</div>
            <div class="badge badge-sm">{statusLabel}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 mb-0.5">トリガー</div>
            <div>{triggerLabel}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 mb-0.5">バージョン</div>
            <div class="font-mono text-xs">{run.tag ?? "—"}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 mb-0.5">開始</div>
            <div class="text-xs">{startedAt}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 mb-0.5">更新</div>
            <div class="text-xs">{updatedAt}</div>
          </div>
        </div>

        {summary != null && (
          <div>
            <div class="text-xs font-semibold opacity-70 mb-1">サマリ (JSON)</div>
            <pre class="text-xs font-mono leading-relaxed bg-base-200 border border-[var(--glass-border)] rounded-xl p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
              {typeof summary === "string" ? summary : JSON.stringify(summary, null, 2)}
            </pre>
          </div>
        )}

        <div>
          <div class="text-xs font-semibold opacity-70 mb-1 flex items-center gap-1">
            <i data-lucide="file-text" class="w-3.5 h-3.5" />
            ログ出力
          </div>
          <pre class="text-xs font-mono leading-relaxed bg-base-200 border border-[var(--glass-border)] rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
            {content || "（ログはまだ出力されていません）"}
          </pre>
        </div>
      </div>
    );
  });

  app.post("/healing/:runId/cancel", async (c) => {
    const runId = c.req.param("runId")!;
    if (!deps.cancelHealing) {
      return c.html(<Alert type="error" message="キャンセル機能が利用できません。" />);
    }
    const result = await deps.cancelHealing(runId);
    if (!result.ok) {
      return c.html(<Alert type="error" message={result.error ?? "キャンセルに失敗しました。"} />);
    }
    return c.html(
      <>
        <Alert type="success" message="自己修復をキャンセルしました。" />
        {await renderHealingRuns(1, "", true)}
      </>
    );
  });

  app.get("/healing/:runId/fix-modal", async (c) => {
    const run = await runs.find(c.req.param("runId")!);
    if (!run) return c.html(<Alert type="error" message="実行が見つかりません。" />, 404);
    if (run.status !== "analyzed") {
      return c.html(<Alert type="error" message="解析が完了した実行だけ修復できます。" />, 400);
    }
    return c.html(<HealingFixModalBody run={run} />);
  });

  app.post("/healing/:runId/fix", async (c) => {
    const userId = c.get("identity").user.id;
    const runId = c.req.param("runId")!;
    const current = await runs.find(runId);
    if (!current) return c.html(<Alert type="error" message="実行が見つかりません。" />, 404);
    if (current.status !== "analyzed") {
      return c.html(<Alert type="error" message="解析が完了した実行だけ修復できます。" />, 400);
    }
    const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
    const dryRun = (body as Record<string, unknown>).dryRun === "true";
    const out = await deps.triggerHealing({ trigger: "gui", userId, dryRun, phase: "fix", runId });
    if (out.error) {
      return c.html(<Alert type="error" message={out.error} />, 400);
    }
    c.header("HX-Redirect", "/healing");
    return c.html(
      <>
        <Alert
          type="success"
          message={
            dryRun
              ? `ドライラン修復を開始しました (実行 ID: ${out.runId.slice(0, 8)})。`
              : `自動修復を開始しました (実行 ID: ${out.runId.slice(0, 8)})。`
          }
        />
        {await renderHealingRuns(1, "", true)}
      </>
    );
  });

  app.post("/healing", async (c) => {
    const userId = c.get("identity").user.id;
    const out = await deps.triggerHealing({ trigger: "gui", userId, phase: "analyze" });
    if (out.error) {
      return c.html(<Alert type="error" message={out.error} />, 400);
    }
    return c.html(
      <>
        <Alert type="success" message={`解析を開始しました (実行 ID: ${out.runId.slice(0, 8)})。`} />
        {await renderHealingRuns(1, "", true)}
      </>
    );
  });

  // ── モデル料金パネル ──────────────────────────────────────────────────────
  app.get("/model-pricing", async (c) => {
    const id = (c.req.query("model") || c.req.query("embeddingModel") || "").trim();
    if (!id) return c.html(<ModelPricingPanel />);
    let models: AiModelInfo[] = [];
    try {
      models = (await ports.ai.listModels?.()) ?? [];
    } catch {
      models = [];
    }
    const found = models.find((m) => m.value === id);
    return c.html(<ModelPricingPanel model={found ?? { value: id, label: id, provider: ports.ai.name }} query={id} />);
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

  // ── システム設定（管理者のみ: 機能トグル/スケジュール） ────────────
  app.put("/system-settings", requireAdmin, async (c) => {
    const body = await c.req.parseBody({ all: true });

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
