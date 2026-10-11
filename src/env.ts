import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { GuiEvent } from "./core/events";

export interface AppConfig {
  githubToken: string;
  openaiKey?: string;
  anthropicKey?: string;
  xaiKey?: string;
  openrouterKey?: string;
  layaKey?: string;
  port: number;
  dbPath: string;
  dataDir: string;
  /**
   * DB ドライバー。`sqlite`（既定）は node:sqlite でプロセス内臓、
   * `rqlite` は別コンテナの rqlite（SQLite の HTTP サービス）に接続する。
   */
  dbDriver: "sqlite" | "rqlite";
  /** rqlite ドライバーの HTTP エンドポイント。既定 `http://127.0.0.1:4001`。 */
  rqliteUrl: string;
  registrationEnabled: boolean;
  startedAt: string;
}

/**
 * Cloudflare バインディング（wrangler.toml の d1/queues と `wrangler secret put` のシークレット）。
 * Node 側の `.env` に対応するもので、ビジネスロジックは AppConfig に正規化されてから使う。
 */
export interface CloudflareBindings {
  DB: D1Database;
  GUI_EVENTS: Queue<GuiEvent>;
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  XAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  LAYA_API_KEY?: string;
  /** "true" で公開登録を許可。未設定なら DB 設定に従う。 */
  OURO_REGISTRATION_ENABLED?: string;
}

/**
 * Cloudflare バインディングを AppConfig に正規化する。
 * port / dbPath / dataDir は Workers では使わないので空値。
 * dbDriver は Cloudflare では無意味（buildContextFromBindings が D1 を使う）。
 */
export function configFromBindings(env: CloudflareBindings): AppConfig {
  return {
    githubToken: env.GITHUB_TOKEN ?? "",
    openaiKey: env.OPENAI_API_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
    xaiKey: env.XAI_API_KEY,
    openrouterKey: env.OPENROUTER_API_KEY,
    layaKey: env.LAYA_API_KEY,
    port: 0,
    dbPath: "",
    dataDir: "",
    dbDriver: "sqlite",
    rqliteUrl: "",
    registrationEnabled: (env.OURO_REGISTRATION_ENABLED ?? "").toLowerCase() === "true",
    startedAt: new Date().toISOString(),
  };
}

export function loadConfig(): AppConfig {
  try {
    process.loadEnvFile();
  } catch (err) {
    // .env が無い場合は無視
  }

  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const xaiKey = process.env.XAI_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const layaKey = process.env.LAYA_API_KEY?.trim();

  const aiKeysPresent = [openaiKey, anthropicKey, xaiKey, openrouterKey].some((k) => k && k.length > 0);

  if (!githubToken) {
    throw new Error("GITHUB_TOKEN is required. Set it in .env");
  }
  if (!aiKeysPresent) {
    throw new Error(
      "At least one AI API key is required: OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, or OPENROUTER_API_KEY"
    );
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const dataDir = process.env.OURO_DATA_DIR ?? "./data";
  mkdirSync(resolve(dataDir), { recursive: true });

  const dbPath = process.env.OURO_DB_PATH ?? resolve(dataDir, "ouroboros.sqlite");
  const dbDriver = (process.env.OURO_DB ?? "sqlite").trim().toLowerCase() === "rqlite" ? "rqlite" : "sqlite";
  const rqliteUrl = process.env.OURO_RQLITE_URL ?? "http://127.0.0.1:4001";
  const registrationEnabled = (process.env.OURO_REGISTRATION_ENABLED ?? "").toLowerCase() === "true";
  const startedAt = new Date().toISOString();

  return {
    githubToken,
    openaiKey,
    anthropicKey,
    xaiKey,
    openrouterKey,
    layaKey,
    port,
    dbPath,
    dataDir: resolve(dataDir),
    dbDriver,
    rqliteUrl,
    registrationEnabled,
    startedAt,
  };
}