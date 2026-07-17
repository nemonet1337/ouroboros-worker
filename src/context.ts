import { GitHubProvider } from "./vcs/github.provider";
import { AuthService } from "./auth/service";
import { Logger } from "./logging/logger";
import { defaultHealingConfig } from "./config/healing.config";
import type { Ports } from "./ports";
import type { HealingConfig } from "./config/healing.config";
import { DEFAULT_WORKERS_AI_MODEL, type DeployTarget } from "./config/deployment";
import type { Env, VersionMetadata } from "./env";
import { D1Adapter } from "./adapters/d1.adapter";
import { R2LogStore } from "./adapters/r2.logstore";
import { CfQueueAdapter } from "./adapters/cf.queue";
import { WorkersAiProvider } from "./adapters/workers-ai.provider";
import { MailChannelsMailer } from "./adapters/mailchannels.mailer";
import { RpcRunner } from "./adapters/rpc.runner";
import { DispatchRunner } from "./adapters/dispatch.runner";
import { DynamicRunner } from "./adapters/dynamic.runner";
import { UnconfiguredRunner, type CodeRunner, type HealingRunner } from "./ports/runner";
import { CfEmailMailer } from "./adapters/cf.email.mailer";
import { CfRateLimiter } from "./adapters/cf.ratelimiter";
import { CfVectorizeAdapter } from "./adapters/cf.vectorize";
import { FlagService } from "./flags/flag.service";
import { AiUsageTracker, CostEstimator } from "./analytics/ai.usage.tracker";

export interface WorkerContext {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  deployTarget: DeployTarget;
  alertRecipients: string[];
  /** OURO_REGISTRATION_ENABLED による上書き。未設定（undefined）なら DB 設定に従う
   *
   * When explicitly set via the OURO_REGISTRATION_ENABLED env var, overrides
   * the DB-persisted registration toggle (see AuthService.isRegistrationEnabled).
   * true = force-open; false = force-closed (first-user bootstrap still allowed).
   * Unset = fall back to the DB setting managed via the settings API/admin panel.
   */
  registrationEnabled?: boolean;
  githubTokenSet: boolean;
  flags?: FlagService;
  analytics?: AiUsageTracker;
  versionMetadata?: VersionMetadata;
}

export async function buildContext(env: Env): Promise<WorkerContext> {
  const db = new D1Adapter(env.DB);
  const logs = new R2LogStore(env.LOGS);
  const logger = new Logger(logs, { file: "ouroboros.log", minLevel: "info" });

  // Workers AI is the sole AI gateway — no external fallback, by design. The
  // only AI credential is the WORKERS_AI_API_TOKEN secret (REST path).
  const workersAiApiToken = env.WORKERS_AI_TOKEN_SECRET
    ? await env.WORKERS_AI_TOKEN_SECRET.get()
    : env.WORKERS_AI_API_TOKEN;

  const ai = new WorkersAiProvider(env.AI, {
    model: env.OURO_PLAN_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
    apiToken: workersAiApiToken,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });

  const githubToken = env.GITHUB_TOKEN_SECRET
    ? await env.GITHUB_TOKEN_SECRET.get()
    : env.GITHUB_TOKEN;

  // GITHUB_REPOSITORY / GITHUB_REPOSITORY_OWNER が未設定ならトークンから自動検出
  let owner = env.GITHUB_REPOSITORY_OWNER || "";
  let repo = "";
  if (env.GITHUB_REPOSITORY) {
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

  // Runner priority: Service Binding (RPC) → HTTP dispatch (RUNNER_URL)
  //   → Worker Loader（動的 Worker 生成）→ UnconfiguredRunner（明示エラー）
  const runnerSecret = env.RUNNER_SHARED_SECRET ?? "";
  const runner: HealingRunner & CodeRunner = env.RUNNER
    ? new RpcRunner(env.RUNNER)
    : env.RUNNER_URL
      ? new DispatchRunner(env.RUNNER_URL, runnerSecret)
      : env.LOADER && githubToken && owner && repo
        ? new DynamicRunner(env.LOADER, {
            ai: env.AI,
            db,
            githubToken,
            repository: `${owner}/${repo}`,
            codeModel: env.OURO_PLAN_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
          })
        : new UnconfiguredRunner();

  const codeRunner = runner as CodeRunner;

  const mailer = env.EMAIL
    ? new CfEmailMailer(env.EMAIL, env.MAIL_FROM ?? "ouroboros@example.com")
    : new MailChannelsMailer(env.MAIL_FROM ?? "ouroboros@example.com");
  const queue = new CfQueueAdapter(env.GUI_EVENTS);
  const rateLimiter = new CfRateLimiter(env.RATE_LIMITER);
  const vectorize = env.VECTORIZE ? new CfVectorizeAdapter(env.VECTORIZE) : undefined;
  const vectorizeCode = env.VECTORIZE_CODE ? new CfVectorizeAdapter(env.VECTORIZE_CODE) : undefined;

  const config: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner,
      repo,
      baseBranch: defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = { ai, vcs, db, logs, queue, mailer, runner, codeRunner, rateLimiter, vectorize, vectorizeCode };
  const auth = new AuthService(db);
  const flags = env.FLAGS ? new FlagService(env.FLAGS) : undefined;
  const analytics = env.AI_ANALYTICS ? new AiUsageTracker(env.AI_ANALYTICS) : undefined;

  return {
    ports,
    config,
    auth,
    logger,
    deployTarget: "cloudflare",
    alertRecipients: (env.OURO_ALERT_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    // 未設定なら undefined のまま渡し、API/GUI は DB の登録トグルへフォールバックする
    // （常に boolean 化すると env 未設定時に登録が恒久的に無効化されてしまう）
    registrationEnabled:
      env.OURO_REGISTRATION_ENABLED === undefined
        ? undefined
        : env.OURO_REGISTRATION_ENABLED === "true",
    githubTokenSet: !!githubToken,
    flags,
    analytics,
    versionMetadata: env.CF_VERSION_METADATA,
  };
}
