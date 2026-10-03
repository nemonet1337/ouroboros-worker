export * from "./ai";
export * from "./vcs";
export * from "./db";
export * from "./logstore";
export * from "./queue";
export * from "./runner";
export * from "./ratelimit";

import type { AiProvider } from "./ai";
import type { VcsProvider } from "./vcs";
import type { DbAdapter } from "./db";
import type { LogStore } from "./logstore";
import type { QueueAdapter } from "./queue";
import type { HealingRunner, CodeRunner } from "./runner";
import type { RateLimiter } from "./ratelimit";

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
  runner: HealingRunner;
  /** 本番では `runner` と同じ RepoRunner。テストだけ別インスタンス可。 */
  codeRunner: CodeRunner;
  rateLimiter: RateLimiter;
}
