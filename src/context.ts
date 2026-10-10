import { GitHubProvider } from "./vcs/github.provider";
import { AuthService } from "./auth/service";
import { Logger } from "./logging/logger";
import { defaultHealingConfig } from "./config/healing.config";
import type { Ports } from "./ports";
import type { HealingConfig } from "./config/healing.config";
import type { AppConfig } from "./env";
import { SqliteAdapter } from "./adapters/sqlite.adapter";
import { MemoryQueue } from "./adapters/memory.queue";
import { MemoryRateLimiter } from "./adapters/memory.ratelimiter";
import { LlmGateway } from "./adapters/ai/gateway";
import { handleGuiEvents } from "./queues/gui-events";
import { UsageAccumulator } from "./analytics/usage.accumulator";
import { SettingsRepository } from "./db/repositories";
import { getSelectedRepo } from "./config/settings.keys";
import { RepoRunner } from "./healing/repo.runner";
import { runMigrations } from "./db/migrate";

export interface WorkerContext {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  /**
   * OURO_REGISTRATION_ENABLED による上書き。未設定（false）なら DB 設定に従う
   */
  registrationEnabled?: boolean;
  githubTokenSet: boolean;
  /** このコンテキスト寿命の AI トークン合計。 */
  usage: UsageAccumulator;
  /** 起動日時（version 表示用）。 */
  startedAt: string;
  /** 現在の対象リポジトリ（settings.selected_repo 優先で解決済み）。 */
  currentRepo: { owner: string; repo: string };
  /** 対象リポジトリを実行時に差し替える（vcs provider と config.vcs をミューテート）。 */
  refreshRepo: (owner: string, repo: string) => void;
  /** プロセス停止時に閉じる */
  close(): Promise<void>;
}

export async function buildContext(config: AppConfig): Promise<WorkerContext> {
  const db = new SqliteAdapter(config.dbPath);
  await runMigrations(db);

  // 出力先は stdout のみ。
  const logger = new Logger({ minLevel: "info" });

  const usage = new UsageAccumulator();
  const ai = new LlmGateway({
    openaiKey: config.openaiKey,
    anthropicKey: config.anthropicKey,
    xaiKey: config.xaiKey,
    openrouterKey: config.openrouterKey,
    layaKey: config.layaKey,
    onUsage: (event) => usage.record(event),
  });

  // キューは同じ context を使い回す（buildContext のスコープ外に持ち出せないので
  // 後から assign するホルダを介して参照する）
  const ctxHolder: { ctx?: WorkerContext } = {};
  const queue = new MemoryQueue({
    onEvent: (event) => handleGuiEvents([event], config, ctxHolder.ctx),
  });
  const rateLimiter = new MemoryRateLimiter();

  // 対象リポジトリの解決順:
  //   1. settings.selected_repo（システム全体で 1 つ・最優先）
  //   2. GITHUB_TOKEN からの自動検出
  const settingsRepo = new SettingsRepository(db);
  const selected = await getSelectedRepo(settingsRepo).catch(() => null);

  const resolved =
    selected ??
    (config.githubToken ? await GitHubProvider.resolveRepoFromToken(config.githubToken) : null);
  const currentRepo = { owner: resolved?.owner ?? "", repo: resolved?.repo ?? "" };

  const vcs = new GitHubProvider({
    token: config.githubToken,
    owner: currentRepo.owner,
    repo: currentRepo.repo,
  });

  // 単一プロセス内の RepoRunner（同一 Worker 内 Runner の Node 版）
  const runner = new RepoRunner(vcs, ai, db);

  const healingConfig: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner: currentRepo.owner,
      repo: currentRepo.repo,
      baseBranch: defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = {
    ai,
    vcs,
    db,
    queue,
    runner,
    codeRunner: runner,
    rateLimiter,
  };
  const auth = new AuthService(db);

  const refreshRepo = (nextOwner: string, nextRepo: string): void => {
    currentRepo.owner = nextOwner;
    currentRepo.repo = nextRepo;
    vcs.setRepo(nextOwner, nextRepo);
    healingConfig.vcs.owner = nextOwner;
    healingConfig.vcs.repo = nextRepo;
  };

  const wctx: WorkerContext = {
    ports,
    config: healingConfig,
    auth,
    logger,
    registrationEnabled: config.registrationEnabled,
    githubTokenSet: !!config.githubToken,
    usage,
    startedAt: config.startedAt,
    currentRepo,
    refreshRepo,
    close: async () => {
      await queue.drain(5_000).catch(() => undefined);
      queue.stop();
      rateLimiter.close();
      db.close();
    },
  };
  ctxHolder.ctx = wctx;
  return wctx;
}
