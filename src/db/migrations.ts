/**
 * Programmatic mirror of db/migrations/*.sql, used by the runtime migration
 * runner (self-hosted boot, optional D1 bootstrap).
 *
 * IMPORTANT: .sql ファイルは新規 DB の `wrangler d1 migrations apply` 用ミラーです。
 * 既存 DB へのマイグレーション適用はランタイム `runMigrations`（`_migrations` 追跡テーブル）
 * が正です。0004/0006/0007 の ALTER ADD COLUMN は非冪等のため、既存 DB への .sql 二重適用は
 * 禁止（新規 DB のみ適用）。
 *
 * The .sql files remain the canonical source consumed by `wrangler d1 migrations apply`;
 * keep both in sync.
 * Each migration is a list of individual statements (D1's prepare runs one at a time).
 */
export interface Migration {
  id: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        prefix TEXT NOT NULL,
        scopes TEXT NOT NULL DEFAULT 'read',
        last_used_at INTEGER,
        revoked_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tokens_user ON api_tokens(user_id)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_hash ON api_tokens(token_hash)`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        target TEXT,
        result TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inspections_user ON inspections(user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS webhooks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id)`,
      `CREATE TABLE IF NOT EXISTS healing_runs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        workflow_id TEXT,
        summary TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_healing_runs_created ON healing_runs(created_at)`,
    ],
  },
  {
    id: "0002_create_admin",
    statements: [
      `INSERT INTO settings (key, value, updated_at)
       VALUES (
         'registration_enabled',
         'true',
         1718300000000
       ) ON CONFLICT(key) DO NOTHING`,
    ],
  },
  {
    id: "0003_code_sessions",
    statements: [
      `CREATE TABLE IF NOT EXISTS code_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        repo_url TEXT NOT NULL,
        branch TEXT NOT NULL DEFAULT 'main',
        base_branch TEXT NOT NULL DEFAULT 'main',
        title TEXT NOT NULL,
        instruction TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'initializing',
        generated_patches TEXT,
        applied_branch TEXT,
        pr_number INTEGER,
        pr_url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_code_sessions_user ON code_sessions(user_id, created_at)`,
    ],
  },
  {
    id: "0004_inspections_status",
    statements: [
      `ALTER TABLE inspections ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`,
    ],
  },
  {
    id: "0005_add_user_model",
    statements: [
      `ALTER TABLE users ADD COLUMN model TEXT`,
    ],
  },
  {
    id: "0006_add_tag_to_healing_runs",
    statements: [
      `ALTER TABLE healing_runs ADD COLUMN tag TEXT`,
    ],
  },
  {
    id: "0007_create_code_session_cache",
    statements: [
      `CREATE TABLE IF NOT EXISTS code_session_cache (
        session_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, key)
      )`,
    ],
  },
];
