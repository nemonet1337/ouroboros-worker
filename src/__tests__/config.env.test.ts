import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, type AppConfig } from "../env";

const REQUIRED = "GITHUB_TOKEN=ghp_test\nOPENAI_API_KEY=sk-openai\n";

let dir = "";

function writeEnv(contents: string): void {
  writeFileSync(join(dir, ".env"), contents, "utf8");
}

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const CLEARED = {
  GITHUB_TOKEN: undefined,
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  XAI_API_KEY: undefined,
  OPENROUTER_API_KEY: undefined,
  LAYA_API_KEY: undefined,
  PORT: undefined,
  OURO_DATA_DIR: undefined,
  OURO_DB_PATH: undefined,
  OURO_DB: undefined,
  OURO_RQLITE_URL: undefined,
  OURO_REGISTRATION_ENABLED: undefined,
};

describe("loadConfig", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  function setup(): void {
    dir = mkdtempSync(join(tmpdir(), "ouro-env-"));
    process.chdir(dir);
    writeEnv("");
  }

  it("throws when .env provides no GITHUB_TOKEN", () => {
    setup();
    withEnv(CLEARED, () => {
      writeEnv("OPENAI_API_KEY=sk-openai\n");
      expect(() => loadConfig()).toThrow(/GITHUB_TOKEN/);
    });
  });

  it("throws when no AI provider key is present", () => {
    setup();
    withEnv(CLEARED, () => {
      writeEnv("GITHUB_TOKEN=ghp_test\n");
      expect(() => loadConfig()).toThrow(/OPENAI_API_KEY.*ANTHROPIC_API_KEY.*XAI_API_KEY.*OPENROUTER_API_KEY/s);
    });
  });

  it("starts with a single AI key", () => {
    setup();
    withEnv(CLEARED, () => {
      writeEnv("GITHUB_TOKEN=ghp_test\nANTHROPIC_API_KEY=sk-anthropic\n");
      const config: AppConfig = loadConfig();
      expect(config.githubToken).toBe("ghp_test");
      expect(config.anthropicKey).toBe("sk-anthropic");
      expect(config.openaiKey).toBeUndefined();
    });
  });

  it("ignores a missing .env and reads process env", () => {
    setup();
    rmSync(join(dir, ".env"), { force: true });
    withEnv(
      {
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        XAI_API_KEY: "sk-xai",
        OPENROUTER_API_KEY: undefined,
        LAYA_API_KEY: undefined,
        PORT: undefined,
        OURO_DATA_DIR: undefined,
        OURO_DB_PATH: undefined,
        OURO_REGISTRATION_ENABLED: undefined,
      },
      () => {
        const config = loadConfig();
        expect(config.githubToken).toBe("ghp_from_env");
        expect(config.xaiKey).toBe("sk-xai");
      }
    );
  });

  it("applies defaults for port, data dir, db path and registration", () => {
    setup();
    withEnv(
      {
        GITHUB_TOKEN: "ghp_test",
        OPENAI_API_KEY: "sk-openai",
        ANTHROPIC_API_KEY: undefined,
        XAI_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
        LAYA_API_KEY: undefined,
        PORT: undefined,
        OURO_DATA_DIR: undefined,
        OURO_DB_PATH: undefined,
        OURO_REGISTRATION_ENABLED: undefined,
      },
      () => {
        writeEnv(REQUIRED);
        const config = loadConfig();
        expect(config.port).toBe(3000);
        expect(config.dataDir).toBe(join(dir, "data"));
        expect(config.dbPath).toBe(join(dir, "data", "ouroboros.sqlite"));
        expect(config.registrationEnabled).toBe(false);
      }
    );
  });

  it("honours explicit overrides", () => {
    setup();
    withEnv({ ...CLEARED, ...REQUIRED.split("\n").reduce<Record<string, string>>((acc, line) => {
      const [k, v] = line.split("=");
      if (k && v) acc[k] = v;
      return acc;
    }, {}), PORT: "8080", OURO_DATA_DIR: join(dir, "custom"), OURO_DB_PATH: join(dir, "custom/x.sqlite"), OURO_REGISTRATION_ENABLED: "true" }, () => {
      writeEnv("");
      const config = loadConfig();
      expect(config.port).toBe(8080);
      expect(config.dataDir).toBe(join(dir, "custom"));
      expect(config.dbPath).toBe(join(dir, "custom/x.sqlite"));
      expect(config.registrationEnabled).toBe(true);
    });
  });

  it("creates the nested data directory", () => {
    setup();
    withEnv({ ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k", OURO_DATA_DIR: join(dir, "a/b/c") }, () => {
      writeEnv("");
      const config = loadConfig();
      expect(config.dataDir).toBe(join(dir, "a/b/c"));
    });
  });

  it("rejects a non-numeric PORT", () => {
    setup();
    withEnv({ ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k", PORT: "not-a-port" }, () => {
      writeEnv("");
      expect(() => loadConfig()).toThrow(/Invalid PORT/);
    });
  });

  it("rejects an out-of-range PORT", () => {
    setup();
    withEnv({ ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k", PORT: "70000" }, () => {
      writeEnv("");
      expect(() => loadConfig()).toThrow(/Invalid PORT/);
    });
  });

  it("defaults the db driver to in-process sqlite", () => {
    setup();
    withEnv({ ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k" }, () => {
      writeEnv("");
      const config = loadConfig();
      expect(config.dbDriver).toBe("sqlite");
      expect(config.rqliteUrl).toBe("http://127.0.0.1:4001");
    });
  });

  it("switches to the rqlite driver with an explicit URL", () => {
    setup();
    withEnv(
      { ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k", OURO_DB: "rqlite", OURO_RQLITE_URL: "http://db:4001" },
      () => {
        writeEnv("");
        const config = loadConfig();
        expect(config.dbDriver).toBe("rqlite");
        expect(config.rqliteUrl).toBe("http://db:4001");
      }
    );
  });

  it("falls back to sqlite for an unknown driver", () => {
    setup();
    withEnv({ ...CLEARED, GITHUB_TOKEN: "t", OPENAI_API_KEY: "k", OURO_DB: "postgres" }, () => {
      writeEnv("");
      expect(loadConfig().dbDriver).toBe("sqlite");
    });
  });

  it("reads the LAYA_API_KEY when present", () => {
    setup();
    withEnv(CLEARED, () => {
      writeEnv(`${REQUIRED}LAYA_API_KEY=laya-secret\n`);
      expect(loadConfig().layaKey).toBe("laya-secret");
    });
  });

  it("sets startedAt to a valid ISO timestamp", () => {
    setup();
    withEnv(CLEARED, () => {
      writeEnv(REQUIRED);
      expect(Number.isNaN(Date.parse(loadConfig().startedAt))).toBe(false);
    });
  });
});

// プロセス環境の前提値（.env が無いケース用）
process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "ghp_from_env";
process.env.XAI_API_KEY = process.env.XAI_API_KEY ?? "sk-xai";
