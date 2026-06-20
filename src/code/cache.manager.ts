import type { DbAdapter } from "../ports/db";
import type { CodeRunner } from "../ports/runner";

export class CacheManager {
  constructor(private readonly db: DbAdapter, private readonly runner: CodeRunner) {}

  async read(sessionId: string, key: string): Promise<string | null> {
    const rows = (await this.db.query<{ value: string }>(
      `SELECT value FROM code_session_cache WHERE session_id = ? AND key = ?`,
      [sessionId, key]
    )) as { value: string }[];
    return rows[0]?.value ?? null;
  }

  async write(sessionId: string, key: string, value: string): Promise<void> {
    await this.db.exec(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [sessionId, key, value, Date.now()]
    );
  }

  async clear(sessionId: string): Promise<void> {
    await this.db.exec(`DELETE FROM code_session_cache WHERE session_id = ?`, [sessionId]);
  }
}