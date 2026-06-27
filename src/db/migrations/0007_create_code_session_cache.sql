-- Code Session Cache: key-value store for staged code changes per session.
-- Composite PK (session_id, key) — used by runner to persist staged file writes,
-- branch info, and commit SHAs without filesystem access.
-- Mirrors runtime migration 0007 in src/db/migrations.ts.
-- WARNING: This table is created fresh; safe to apply to existing databases.

CREATE TABLE IF NOT EXISTS code_session_cache (
  session_id TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, key)
);
