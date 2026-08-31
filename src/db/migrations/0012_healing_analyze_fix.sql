-- Split self-healing into analyze / fix phases and persist model + token usage.
-- Mirrors runtime migration 0012 in src/db/migrations.ts.
-- WARNING: ALTER TABLE ADD COLUMN is non-idempotent.
-- Do NOT apply to an existing database that already has these columns.
-- Existing databases use runtime runMigrations() which tracks via _migrations table.

ALTER TABLE healing_runs ADD COLUMN inspection_id TEXT;
ALTER TABLE healing_runs ADD COLUMN model TEXT;
ALTER TABLE healing_runs ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN fix_model TEXT;
ALTER TABLE healing_runs ADD COLUMN fix_prompt_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE healing_runs ADD COLUMN fix_completion_tokens INTEGER NOT NULL DEFAULT 0;
