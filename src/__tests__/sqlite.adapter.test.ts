import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteAdapter } from "../db/sqlite";
import { runMigrations, loadMigrations } from "../db/migrate";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ouro-sqlite-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("SqliteAdapter", () => {
  it("creates the parent directory and reports the sqlite dialect", () => {
    const path = join(dir, "nested/deeper/ouro.sqlite");
    const db = new SqliteAdapter(path);
    try {
      expect(db.dialect).toBe("sqlite");
    } finally {
      db.close();
    }
  });

  it("runs query, exec and batch", async () => {
    const db = new SqliteAdapter(join(dir, "basic.sqlite"));
    try {
      await db.exec(`CREATE TABLE t (id TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
      await db.exec(`INSERT INTO t (id, n) VALUES (?, ?)`, ["a", 1]);
      await db.batch([
        { sql: `INSERT INTO t (id, n) VALUES (?, ?)`, params: ["b", 2] },
        { sql: `INSERT INTO t (id, n) VALUES (?, ?)`, params: ["c", 3] },
      ]);
      const rows = await db.query<{ id: string; n: number }>(`SELECT id, n FROM t ORDER BY n`);
      expect(rows).toEqual([
        { id: "a", n: 1 },
        { id: "b", n: 2 },
        { id: "c", n: 3 },
      ]);
    } finally {
      db.close();
    }
  });

  it("returns 0 rows for an empty result instead of throwing", async () => {
    const db = new SqliteAdapter(join(dir, "empty.sqlite"));
    try {
      await db.exec(`CREATE TABLE t (id TEXT PRIMARY KEY)`);
      const rows = await db.query(`SELECT id FROM t WHERE id = ?`, ["nope"]);
      expect(rows).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("rolls the whole batch back when one statement fails", async () => {
    const db = new SqliteAdapter(join(dir, "rollback.sqlite"));
    try {
      await db.exec(`CREATE TABLE t (id TEXT PRIMARY KEY)`);
      await db.exec(`INSERT INTO t (id) VALUES (?)`, ["keep"]);
      await expect(
        db.batch([
          { sql: `INSERT INTO t (id) VALUES (?)`, params: ["x"] },
          { sql: `INSERT INTO t (id) VALUES (?)`, params: ["keep"] },
        ])
      ).rejects.toThrow();
      const rows = await db.query<{ id: string }>(`SELECT id FROM t`);
      expect(rows.map((r) => r.id)).toEqual(["keep"]);
    } finally {
      db.close();
    }
  });

  it("enforces foreign keys when enabled", async () => {
    const db = new SqliteAdapter(join(dir, "fk.sqlite"));
    try {
      await db.batch(loadMigrations()[0].statements.map((sql) => ({ sql })));
      const violations = await db.query<{ table_name: string }>(`PRAGMA foreign_key_check`);
      expect(violations).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("runs the migration runner against a fresh file db", async () => {
    const db = new SqliteAdapter(join(dir, "migrated.sqlite"));
    try {
      await runMigrations(db);
      await runMigrations(db);
      const rows = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM _migrations`);
      expect(Number(rows[0].n)).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("works with an in-memory database", async () => {
    const db = new SqliteAdapter(":memory:");
    try {
      await db.exec(`CREATE TABLE t (n INTEGER)`);
      await db.exec(`INSERT INTO t (n) VALUES (?)`, [7]);
      const rows = await db.query<{ n: number }>(`SELECT n FROM t`);
      expect(rows[0].n).toBe(7);
    } finally {
      db.close();
    }
  });
});
