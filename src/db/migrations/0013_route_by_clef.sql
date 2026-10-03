-- Route codegen by Clef difficulty and drop the retired Plan phase columns.
-- Mirrors runtime migration 0013 in src/db/migrations.ts.
-- WARNING: ALTER TABLE ADD COLUMN is non-idempotent, and DROP COLUMN fails if the
-- column does not exist. Do NOT apply to an existing database that already has these
-- columns. Existing databases use runtime runMigrations() which tracks via _migrations.
--
-- DROP COLUMN was verified against Cloudflare D1 (SQLite >= 3.35), including on a
-- `NOT NULL DEFAULT` column, which is what code_sessions.mode was.

ALTER TABLE code_sessions ADD COLUMN difficulty REAL;
ALTER TABLE code_sessions ADD COLUMN tier TEXT;
ALTER TABLE code_sessions ADD COLUMN route_model TEXT;
ALTER TABLE code_sessions ADD COLUMN route_effort TEXT;

-- Plan フェーズ廃止
ALTER TABLE code_sessions DROP COLUMN plan;
ALTER TABLE code_sessions DROP COLUMN mode;
ALTER TABLE users DROP COLUMN mode_models;

-- Prompt cache accounting so the GUI can show the cached share of input tokens.
ALTER TABLE healing_runs ADD COLUMN cached_prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN cache_write_prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN fix_cached_prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN fix_cache_write_prompt_tokens INTEGER NOT NULL DEFAULT 0;

-- Vectorize 廃止の設定キー
DELETE FROM settings WHERE key = 'embedding_model';
DELETE FROM settings WHERE key = 'code_index_status';