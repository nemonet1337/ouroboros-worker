-- Code Sessions table: tracks AI-assisted code fix sessions per user.
-- Mirrors runtime migration 0003 in src/db/migrations.ts.
-- NOTE: ALTER migrations (0004/0006/0007) are non-idempotent.
-- Apply .sql files ONLY to fresh databases. Existing databases use runtime runMigrations().

CREATE TABLE IF NOT EXISTS code_sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  repo_url         TEXT NOT NULL,
  branch           TEXT NOT NULL DEFAULT 'main',
  base_branch      TEXT NOT NULL DEFAULT 'main',
  title            TEXT NOT NULL,
  instruction      TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'initializing',
  generated_patches TEXT,
  applied_branch   TEXT,
  pr_number        INTEGER,
  pr_url           TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_sessions_user ON code_sessions(user_id, created_at);
