import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DbAdapter, SqlParam } from "./adapter";

export class SqliteAdapter implements DbAdapter {
  readonly dialect = "sqlite" as const;
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
    this.db.exec("PRAGMA journal_mode=WAL;");
  }

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const res = stmt.all(...params) as T[];
      return res;
    } catch (err) {
      throw err;
    }
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...(params ?? []));
  }

  async batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void> {
    this.db.exec("BEGIN");
    try {
      for (const s of statements) {
        const stmt = this.db.prepare(s.sql);
        stmt.run(...(s.params ?? []));
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch (err) {
      // ignore
    }
  }
}
