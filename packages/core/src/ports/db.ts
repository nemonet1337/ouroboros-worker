export type SqlParam = string | number | null;

/**
 * Minimal SQL adapter satisfied by Cloudflare D1. Repositories build only
 * `?`-placeholder SQL.
 */
export interface DbAdapter {
  readonly dialect: "sqlite" | "d1";
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  /** Run a batch of statements (used by the migration runner). */
  batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void>;
}
