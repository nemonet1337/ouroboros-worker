import { GitHubProvider } from "./vcs/github.provider";
import { AuthService } from "./auth/service";
import { Logger } from "./logging/logger";
import { defaultHealingConfig } from "./config/healing.config";
import type { Ports } from "./ports";
import type { HealingConfig } from "./config/healing.config";
import { DEFAULT_WORKERS_AI_MODEL } from "./config/deployment";
import type { Env, VersionMetadata } from "./env";
import { D1Adapter } from "./adapters/d1.adapter";
import { R2LogStore } from "./adapters/r2.logstore";
import { CfQueueAdapter } from "./adapters/cf.queue";
import { WorkersAiProvider } from "./adapters/workers-ai.provider";
import { CfRateLimiter } from "./adapters/cf.ratelimiter";
import { CfVectorizeAdapter } from "./adapters/cf.vectorize";
import { AiUsageTracker } from "./analytics/ai.usage.tracker";
import { UsageAccumulator } from "./analytics/usage.accumulator";
import { SettingsRepository } from "./db/repositories";
import { getSelectedRepo } from "./config/settings.keys";
import { RepoRunner } from "./healing/repo.runner";

export interface WorkerContext {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  /**
   * OURO_REGISTRATION_ENABLED による上書き。未設定（undefined）なら DB 設定に従う
   */
  registrationEnabled?: boolean;
  githubTokenSet: boolean;
  analytics?: AiUsageTracker;
  /** このコンテキスト寿命の AI トークン合計（Workflow ステップごとに新しい context）。 */
  usage: UsageAccumulator;
  versionMetadata?: VersionMetadata;
  /** 現在の対象リポジトリ（settings.selected_repo 優先で解決済み）。 */
  currentRepo: { owner: string; repo: string };
  /** 対象リポジトリを実行時に差し替える（vcs provider と config.vcs をミューテート）。 */
  refreshRepo: (owner: string, repo: string) => void;
}

export async function buildContext(env: Env): Promise<WorkerContext> {
  const db = new D1Adapter(env.DB);
  const logs = new R2LogStore(env.LOGS);
  // ベース名のみ指定。Logger が UTC 日付付きファイル（ouroboros-YYYY-MM-DD.log）へ日次切替する
  const logger = new Logger(logs, { file: "ouroboros", minLevel: "info" });

  // カタログモデルは AI binding。パートナーモデルのみ REST（401/403 後は isolate 内で binding 固定）。
  const workersAiApiToken = env.WORKERS_AI_TOKEN_SECRET
    ? await env.WORKERS_AI_TOKEN_SECRET.get()
    : env.WORKERS_AI_API_TOKEN;

  const analytics = env.AI_ANALYTICS ? new AiUsageTracker(env.AI_ANALYTICS) : undefined;
  const usage = new UsageAccumulator();
  const ai = new WorkersAiProvider(env.AI, {
    model: DEFAULT_WORKERS_AI_MODEL,
    apiToken: workersAiApiToken,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    onUsage: (event) => {
      usage.record(event);
      analytics?.record(event);
    },
  });

  const githubToken = env.GITHUB_TOKEN_SECRET
    ? await env.GITHUB_TOKEN_SECRET.get()
    : env.GITHUB_TOKEN;

  // 対象リポジトリの解決順:
  //   1. settings.selected_repo（D1、システム全体で 1 つ・最優先）
  //   2. GITHUB_REPOSITORY / GITHUB_REPOSITORY_OWNER env
  //   3. GITHUB_TOKEN からの自動検出
  const settingsRepo = new SettingsRepository(db);
  const selected = await getSelectedRepo(settingsRepo).catch(() => null);

  let owner = selected?.owner || env.GITHUB_REPOSITORY_OWNER || "";
  let repo = selected?.repo || "";
  if (!selected && env.GITHUB_REPOSITORY) {
    const parts = env.GITHUB_REPOSITORY.split("/");
    owner = owner || parts[0] || "";
    repo = parts[1] || "";
  }
  if (!owner || !repo) {
    const resolved = githubToken ? await GitHubProvider.resolveRepoFromToken(githubToken) : null;
    if (resolved) {
      owner = owner || resolved.owner;
      repo = repo || resolved.repo;
    }
  }

  const vcs = new GitHubProvider({
    token: githubToken ?? "",
    owner,
    repo,
  });

  // 単一 Worker 内の RepoRunner（旧 runner Service Binding は廃止）
  const runner = new RepoRunner(vcs, ai, db);

  const queue = new CfQueueAdapter(env.GUI_EVENTS);
  const rateLimiter = new CfRateLimiter(env.RATE_LIMITER);
  const vectorize = env.VECTORIZE ? new CfVectorizeAdapter(env.VECTORIZE) : undefined;

  const config: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner,
      repo,
      baseBranch: defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = {
    ai,
    vcs,
    db,
    logs,
    queue,
    runner,
    codeRunner: runner,
    rateLimiter,
    vectorize,
  };
  const auth = new AuthService(db);

  const currentRepo = { owner, repo };
  const refreshRepo = (nextOwner: string, nextRepo: string): void => {
    currentRepo.owner = nextOwner;
    currentRepo.repo = nextRepo;
    vcs.setRepo(nextOwner, nextRepo);
    config.vcs.owner = nextOwner;
    config.vcs.repo = nextRepo;
  };

  return {
    ports,
    config,
    auth,
    logger,
    registrationEnabled:
      env.OURO_REGISTRATION_ENABLED === undefined
        ? undefined
        : env.OURO_REGISTRATION_ENABLED === "true",
    githubTokenSet: !!githubToken,
    analytics,
    usage,
    versionMetadata: env.CF_VERSION_METADATA,
    currentRepo,
    refreshRepo,
  };
}
