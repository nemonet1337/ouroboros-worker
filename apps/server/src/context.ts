import { execSync } from "node:child_process";
import {
  AnthropicProvider,
  GitHubProvider,
  AuthService,
  Logger,
  runMigrations,
  defaultHealingConfig,
  type Ports,
  type HealingConfig,
  type DeployTarget,
} from "@ouroboros/core";
import { SqliteAdapter } from "./adapters/sqlite.adapter";
import { FsLogStore } from "./adapters/fs.logstore";
import { InProcessQueue } from "./adapters/inprocess.queue";
import { SmtpMailer } from "./adapters/smtp.mailer";
import { NoopMailer } from "./adapters/noop.mailer";
import { NoopRateLimiter } from "./adapters/noop.ratelimiter";
import { LocalRunner } from "./adapters/local.runner";

export interface ServerContext {
  ports: Ports;
  config: HealingConfig;
  auth: AuthService;
  logger: Logger;
  deployTarget: DeployTarget;
  queue: InProcessQueue;
  repoRoot: string;
  alertRecipients: string[];
  assignees: string[];
}

function resolveRepoRoot(): string {
  if (process.env.OURO_REPO_ROOT) return process.env.OURO_REPO_ROOT;
  if (process.env.GITHUB_WORKSPACE) return process.env.GITHUB_WORKSPACE;
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return process.cwd();
  }
}

export async function createContext(): Promise<ServerContext> {
  const env = process.env;
  const repoRoot = resolveRepoRoot();

  const db = new SqliteAdapter(env.OURO_DB_PATH ?? "/data/ouroboros.db");
  await runMigrations(db);

  const logs = new FsLogStore(env.OURO_LOG_DIR ?? "/logs");
  const logger = new Logger(logs, { file: "ouroboros.log", minLevel: "info" });

  // Local deploy: AI gateway credentials come from the environment (.env) —
  // ANTHROPIC_API_KEY / OURO_AI_MODEL — loaded at process startup.
  const ai = new AnthropicProvider(env.ANTHROPIC_API_KEY ?? "", env.OURO_AI_MODEL ?? defaultHealingConfig.ai.model);

  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "/").split("/");
  const vcs = new GitHubProvider({
    token: env.GITHUB_TOKEN ?? "",
    owner: env.GITHUB_REPOSITORY_OWNER || owner || "",
    repo: repo || "",
  });

  const mailer = env.SMTP_HOST
    ? new SmtpMailer({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? "587"),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM ?? "ouroboros@localhost",
        secure: env.SMTP_SECURE === "true",
      })
    : new NoopMailer();

  const queue = new InProcessQueue();
  const runner = new LocalRunner(defaultHealingConfig, ai, repoRoot);
  const rateLimiter = new NoopRateLimiter();

  const config: HealingConfig = {
    ...defaultHealingConfig,
    vcs: {
      ...defaultHealingConfig.vcs,
      owner: env.GITHUB_REPOSITORY_OWNER || owner || "",
      repo: repo || "",
      baseBranch: env.OURO_BASE_BRANCH ?? defaultHealingConfig.vcs.baseBranch,
    },
  };

  const ports: Ports = { ai, vcs, db, logs, queue, mailer, runner, rateLimiter };
  const auth = new AuthService(db);

  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
    await auth.ensureAdminUser(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  }

  return {
    ports,
    config,
    auth,
    logger,
    deployTarget: "local",
    queue,
    repoRoot,
    alertRecipients: (env.OURO_ALERT_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    assignees: (env.SELF_HEALING_ASSIGNEES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
