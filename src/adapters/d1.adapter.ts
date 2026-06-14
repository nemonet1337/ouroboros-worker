import type { DbAdapter, SqlParam } from "../ports";

/** DbAdapter backed by Cloudflare D1. */
export class D1Adapter implements DbAdapter {
  readonly dialect = "d1" as const;

  constructor(private readonly db: D1Database) {}

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql).bind(...params);
    const { results } = await stmt.all<T>();
    return results ?? [];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    await this.db.prepare(sql).bind(...params).run();
  }

  async batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void> {
    await this.db.batch(statements.map((s) => this.db.prepare(s.sql).bind(...(s.params ?? []))));
  }
}
