export type SqlParam = string | number | null;

/**
 * Minimal SQL adapter satisfied by both better-sqlite3 (self-hosted)
 * and Cloudflare D1 (edge). Repositories build only `?`-placeholder SQL
 * so the same queries run unchanged on both back ends.
 */
export interface DbAdapter {
  readonly dialect: "sqlite" | "d1";
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  /** Run a batch of statements (used by the migration runner). */
  batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void>;
}
