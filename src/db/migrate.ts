import type { DbAdapter } from "../ports/db";
import { MIGRATIONS } from "./migrations";

/**
 * Applies any pending migrations, tracked in a `_migrations` table.
 * Idempotent and safe to call on every boot. Works on SQLite and D1.
 */
export async function runMigrations(db: DbAdapter): Promise<string[]> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
  );

  const rows = await db.query<{ id: string }>(`SELECT id FROM _migrations`);
  const applied = new Set(rows.map((r) => r.id));
  const ran: string[] = [];

  for (const migration of MIGRATIONS) {
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
