import type { GuiEvent } from "./ports/queue";

// ── Cloudflare ネイティブ バインディング型 ──────────────────────────────────

export interface AnalyticsEngineDataset {
  writeDataPoint(opts: {
    indexes?: string[];
    doubles?: number[];
    blobs?: string[];
  }): void;
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
  GUI_EVENTS: Queue<GuiEvent>;
  AI: Ai;
  HEALING_WORKFLOW: Workflow;
  RATE_LIMITER?: RateLimit;
  AI_ANALYTICS?: AnalyticsEngineDataset;
  CF_VERSION_METADATA?: VersionMetadata;

  // vars
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** "true" to open registration; anything else (or absent) means closed. Default: false. */
  OURO_REGISTRATION_ENABLED?: string;

  // secrets（`wrangler secret put`）
  WORKERS_AI_API_TOKEN?: string;
  GITHUB_TOKEN?: string;
}

/** Minimal RateLimit binding shape (Workers Rate Limiting API). */
export interface RateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}
