import { DatabaseSync } from "node:sqlite";
import type { DbAdapter, SqlParam } from "@ouroboros/core";

/** DbAdapter backed by node:sqlite (synchronous, wrapped in promises). */
export class SqliteAdapter implements DbAdapter {
  readonly dialect = "sqlite" as const;
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    if (params.length === 0 && /;\s*\S/.test(sql)) {
      // multi-statement DDL
      this.db.exec(sql);
      return;
    }
    this.db.prepare(sql).run(...params);
  }

  async batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void> {
    this.db.exec("BEGIN TRANSACTION");
    try {
      for (const s of statements) {
        this.db.prepare(s.sql).run(...(s.params ?? []));
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
