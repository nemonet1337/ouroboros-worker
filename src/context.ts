import { GitHubProvider } from "./vcs/github.provider";
import { AuthService } from "./auth/service";
import { Logger } from "./logging/logger";
import { defaultHealingConfig } from "./config/healing.config";
import type { Ports } from "./ports";
import type { HealingConfig } from "./config/healing.config";
import type { DeployTarget } from "./config/deployment";
import type { Env } from "./env";
import { D1Adapter } from "./adapters/d1.adapter";
import { R2LogStore } from "./adapters/r2.logstore";
import { CfQueueAdapter } from "./adapters/cf.queue";
import { WorkersAiProvider } from "./adapters/workers-ai.provider";
import { MailChannelsMailer } from "./adapters/mailchannels.mailer";
import { RpcRunner } from "./adapters/rpc.runner";
import { NoopRunner, type CodeRunner } from "./ports/runner";
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
  registrationEnabled: boolean;
  githubTokenSet: boolean;
  flags?: FlagService;
  analytics?: AiUsageTracker;
}

export function buildContext(env: Env): WorkerContext {
  const db = new D1Adapter(env.DB);
  const logs = new R2LogStore(env.LOGS);
  const logger = new Logger(logs, { file: "ouroboros.log", minLevel: "info" });

  // Workers AI is the sole AI gateway — no external fallback, by design. The
  // only AI credential is the WORKERS_AI_API_TOKEN secret (REST path).
  const ai = new WorkersAiProvider(env.AI, {
    model: "minimax/m3",
    apiToken: env.WORKERS_AI_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
  });

  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "/").split("/");
  const vcs = new GitHubProvider({
    token: env.GITHUB_TOKEN ?? "",
    owner: env.GITHUB_REPOSITORY_OWNER || owner || "",
    repo: repo || "",
  });

  // External runner (DispatchRunner via RUNNER_URL) is fully retired —
  // heavy work now goes through the in-process NoopRunner or an RPC binding
  // (env.RUNNER) when one is configured.
  const runner: RpcRunner | NoopRunner = env.RUNNER
    ? new RpcRunner(env.RUNNER)
    : new NoopRunner();

  const codeRunner = runner instanceof NoopRunner ? runner : (runner as unknown as CodeRunner);

  const mailer = env.EMAIL
    ? new CfEmailMailer(env.EMAIL, env.MAIL_FROM ?? "ouroboros@example.com")
    : new MailChannelsMailer(env.MAIL_FROM ?? "ouroboros@example.com");
  const queue = new CfQueueAdapter(env.GUI_EVENTS);
  const rateLimiter = new CfRateLimiter(env.RATE_LIMITER);
  const vectorize = env.VECTORIZE ? new CfVectorizeAdapter(env.VECTORIZE) : undefined;

  const config: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner: env.GITHUB_REPOSITORY_OWNER || owner || "",
      repo: repo || "",
      baseBranch: defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = { ai, vcs, db, logs, queue, mailer, runner, codeRunner, rateLimiter, vectorize };
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
    registrationEnabled: env.OURO_REGISTRATION_ENABLED === "true",
    githubTokenSet: !!(env.GITHUB_TOKEN),
    flags,
    analytics,
  };
}
