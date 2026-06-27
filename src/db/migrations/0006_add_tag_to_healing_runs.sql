-- Add tag column to healing_runs for deployment version tracking.
-- Mirrors runtime migration 0006 in src/db/migrations.ts.
-- WARNING: ALTER TABLE ADD COLUMN is non-idempotent.
-- Do NOT apply to an existing database that already has this column.
-- Existing databases use runtime runMigrations() which tracks via _migrations table.

ALTER TABLE healing_runs ADD COLUMN tag TEXT;
