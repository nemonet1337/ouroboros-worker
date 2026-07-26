import type { GuiEvent } from "./ports/queue";

// ── Cloudflare ネイティブ バインディング型 ──────────────────────────────────

export interface AnalyticsEngineDataset {
  writeDataPoint(opts: {
    indexes?: string[];
    doubles?: number[];
    blobs?: string[];
  }): void;
}

export interface SendEmailBinding {
  send(message: { to: string; from: string; subject: string; html?: string; text?: string }): Promise<unknown>;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  headers: Headers;
  forward(dest: string): Promise<void>;
}

export interface FlagshipBinding {
  getBooleanValue(flag: string, defaultValue: boolean, opts?: Record<string, unknown>): Promise<boolean>;
  getStringValue(flag: string, defaultValue: string, opts?: Record<string, unknown>): Promise<string>;
  getNumberValue(flag: string, defaultValue: number, opts?: Record<string, unknown>): Promise<number>;
  getJSONValue<T = unknown>(flag: string, defaultValue: T, opts?: Record<string, unknown>): Promise<T>;
}

export interface SecretsStoreSecret {
  get(): Promise<string>;
}

export interface VersionMetadata {
  id: string;
  tag: string;
  timestamp: string;
}

/** Bindings + vars declared in wrangler.toml and via `wrangler secret put`. */
export interface Env {
  // bindings
  DB: D1Database;
  LOGS: R2Bucket;
  GUI_EVENTS: Queue<GuiEvent>;
  AI: Ai;
  HEALING_WORKFLOW: Workflow;
  RATE_LIMITER?: RateLimit;
  VECTORIZE?: VectorizeIndex;
  AI_ANALYTICS?: AnalyticsEngineDataset;
  EMAIL?: SendEmailBinding;
  FLAGS?: FlagshipBinding;
  CF_VERSION_METADATA?: VersionMetadata;

  // secrets（Secrets Store）
  GITHUB_TOKEN_SECRET?: SecretsStoreSecret;
  WORKERS_AI_TOKEN_SECRET?: SecretsStoreSecret;

  // vars
  OURO_ALERT_EMAILS?: string;
  MAIL_FROM?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** "true" to open registration; anything else (or absent) means closed. Default: false. */
  OURO_REGISTRATION_ENABLED?: string;

  // secrets（wrangler secret put）
  WORKERS_AI_API_TOKEN?: string;
  GITHUB_TOKEN?: string;
  /** @deprecated GITHUB_TOKEN から自動検出。明示上書きのみ */
  GITHUB_REPOSITORY?: string;
  /** @deprecated GITHUB_TOKEN から自動検出。明示上書きのみ */
  GITHUB_REPOSITORY_OWNER?: string;
  /** Webhook secret 暗号化キー */
  OURO_ENCRYPTION_KEY?: string;
}

/** Minimal RateLimit binding shape (Workers Rate Limiting API). */
export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}
