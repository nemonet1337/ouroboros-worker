export * from "./ai";
export * from "./vcs";
export * from "./db";
export * from "./logstore";
export * from "./queue";
export * from "./mailer";
export * from "./runner";
export * from "./ratelimit";
export * from "./vectorize";

import type { AiProvider } from "./ai";
import type { VcsProvider } from "./vcs";
import type { DbAdapter } from "./db";
import type { LogStore } from "./logstore";
import type { QueueAdapter } from "./queue";
import type { Mailer } from "./mailer";
import type { HealingRunner, CodeRunner } from "./runner";
import type { RateLimiter } from "./ratelimit";
import type { VectorizePort } from "./vectorize";

/**
 * The full set of platform adapters an Ouroboros deployment wires up.
 * src/context.ts constructs one of these
 * and hand it to the shared core logic.
 */
export interface Ports {
  ai: AiProvider;
  vcs: VcsProvider;
  db: DbAdapter;
  logs: LogStore;
  queue: QueueAdapter;
  mailer: Mailer;
  runner: HealingRunner;
  codeRunner: CodeRunner;
  rateLimiter: RateLimiter;
  /** コード埋め込み検索用インデックス（ouroboros-code-index） */
  vectorize?: VectorizePort;
}
