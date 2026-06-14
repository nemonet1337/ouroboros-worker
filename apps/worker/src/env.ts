import type { GuiEvent } from "@ouroboros/core";

/** Bindings + vars declared in wrangler.toml and via `wrangler secret put`. */
export interface Env {
  // bindings
  DB: D1Database;
  LOGS: R2Bucket;
  GUI_EVENTS: Queue<GuiEvent>;
  AI: Ai;
  HEALING_WORKFLOW: Workflow;
  RATE_LIMITER?: RateLimit;
  ASSETS: Fetcher;
  VECTORIZE?: VectorizeIndex;

  // vars
  DEPLOY_TARGET?: string;
  RUNNER_URL?: string;
  OURO_WORKERS_AI_MODEL?: string;
  OURO_ALERT_EMAILS?: string;
  OURO_BASE_BRANCH?: string;
  MAIL_FROM?: string;

  // secrets — the ONLY AI credential is WORKERS_AI_API_TOKEN (a Cloudflare
  // API token scoped to Workers AI). External gateways (Anthropic, OpenAI, …)
  // are not accepted anywhere in this deployment.
  WORKERS_AI_API_TOKEN?: string;
  /** Cloudflare account id — only needed when WORKERS_AI_API_TOKEN is set and
   * inference should go through the Workers AI REST API instead of the binding. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  GITHUB_REPOSITORY_OWNER?: string;
  RUNNER_SHARED_SECRET?: string;

}

/** Minimal RateLimit binding shape (Workers Rate Limiting API). */
export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}
