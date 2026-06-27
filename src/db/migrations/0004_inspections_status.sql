-- Add status column to inspections table.
-- Mirrors runtime migration 0004 in src/db/migrations.ts.
-- WARNING: ALTER TABLE ADD COLUMN is non-idempotent.
-- Do NOT apply to an existing database that already has this column.
-- Existing databases use runtime runMigrations() which tracks via _migrations table.

ALTER TABLE inspections ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
