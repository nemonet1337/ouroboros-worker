import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbAdapter } from "./adapter";

export interface Migration {
  id: string;
  statements: string[];
}

/** このファイル（db/）から見た migrations ディレクトリ。 */
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/**
 * `db/migrations/*.sql` を読み込み、`;` 区切りのステートメント配列にする。
 * ファイル名（拡張子なし）が migration id。`node:sqlite` の prepare は
 * 1 ステートメントしか実行できないため、ファイル単位を文単位に分割する。
 *
 * ⚠️ Node 側の起動時 apply 専用。Cloudflare は `wrangler d1 migrations apply`
 * （同じ migrations_dir）を使うので、このモジュールを Worker バンドルに
 * 入れないこと（buildContext からのみ参照する）。
 */
export function loadMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      id: name.replace(/\.sql$/, ""),
      statements: splitStatements(readFileSync(join(MIGRATIONS_DIR, name), "utf8")),
    }));
}

/** `--` 行コメントを落とし `;` で分割、空ステートメントを除く。 */
function splitStatements(sql: string): string[] {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Applies any pending migrations, tracked in a `_migrations` table.
 * Idempotent and safe to call on every boot. Works on SQLite and rqlite.
 */
export async function runMigrations(db: DbAdapter): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );

  const rows = await db.query<{ id: string }>(`SELECT id FROM _migrations`);
  const applied = new Set(rows.map((r) => r.id));
  const ran: string[] = [];

  for (const migration of loadMigrations()) {
    if (applied.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await db.exec(statement);
    }
    await db.exec(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`, [
      migration.id,
      Date.now(),
    ]);
    ran.push(migration.id);
  }

  return ran;
}
