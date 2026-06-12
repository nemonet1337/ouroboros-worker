import type { GuiEvent } from "@ouroboros/core";

/** Bindings + vars declared in wrangler.toml and via `wrangler secret put`. */
export interface Env {
  // bindings
  DB: D1Database;
  LOGS: R2Bucket;
  GUI_EVENTS: Queue<GuiEvent>;
  AI: Ai;
  HEALING_WORKFLOW: Workflow;
  RATE_LIMITER: RateLimit;
  ASSETS: Fetcher;

  // vars
  DEPLOY_TARGET?: string;
  RUNNER_URL?: string;
  OURO_WORKERS_AI_MODEL?: string;
  OURO_ALERT_EMAILS?: string;
  OURO_BASE_BRANCH?: string;
  MAIL_FROM?: string;

  // secrets — note: no AI gateway secrets. The Cloudflare deploy uses the
  // Workers AI binding (AI) exclusively; external gateways are not accepted.
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_REPOSITORY_OWNER?: string;
  RUNNER_SHARED_SECRET?: string;

  // Admin user bootstrap — set these to auto-create (or update) the single
  // admin account on first request after deploy.  Rotating ADMIN_PASSWORD
  // updates the stored hash on the next Worker startup.
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
}

/** Minimal RateLimit binding shape (Workers Rate Limiting API). */
export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}
