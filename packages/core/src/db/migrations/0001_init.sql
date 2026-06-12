-- Ouroboros initial schema. Portable across SQLite (self-hosted) and Cloudflare D1.
-- Only the common subset is used: TEXT/INTEGER columns, INTEGER epoch-ms timestamps,
-- app-generated UUID ids (no SERIAL, no DB-side defaults beyond constants).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  scopes       TEXT NOT NULL DEFAULT 'read',
  last_used_at INTEGER,
  revoked_at   INTEGER,
  expires_at   INTEGER,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON api_tokens(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_hash ON api_tokens(token_hash);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS inspections (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  target     TEXT,
  result     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspections_user ON inspections(user_id, created_at);

CREATE TABLE IF NOT EXISTS webhooks (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  url        TEXT NOT NULL,
  type       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  config     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);

CREATE TABLE IF NOT EXISTS healing_runs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT,
  status      TEXT NOT NULL,
  trigger     TEXT NOT NULL,
  workflow_id TEXT,
  summary     TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_healing_runs_created ON healing_runs(created_at);
