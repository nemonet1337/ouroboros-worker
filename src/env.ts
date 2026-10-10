import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

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
  registrationEnabled: boolean;
  startedAt: string;
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
    registrationEnabled,
    startedAt,
  };
}