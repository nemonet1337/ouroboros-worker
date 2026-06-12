import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { mountApi } from "@ouroboros/core";
import { createContext } from "./context";
import { makeTriggerHealing } from "./healing";
import { createRunnerEndpoint } from "./runner-endpoint";
import { startCron } from "./cron";

/**
 * Local deploys read AI gateway settings (ANTHROPIC_API_KEY, OURO_AI_MODEL, …)
 * from a .env file. Variables already present in the environment (e.g. set by
 * Docker Compose) take precedence and are not overridden.
 */
function loadDotEnv(): void {
  const envFile = resolve(process.env.OURO_ENV_FILE ?? ".env");
  if (!existsSync(envFile)) return;
  try {
    process.loadEnvFile(envFile);
    console.log(`[server] loaded environment from ${envFile}`);
  } catch (err) {
    console.warn(`[server] failed to load ${envFile}:`, err);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const ctx = await createContext();
  const triggerHealing = makeTriggerHealing(ctx);

  const app = new Hono();

  // Shared API (auth, tokens, inspect, webhooks, healing, settings, logs)
  // mounted at /api/v1 (canonical) and /api (compat alias).
  mountApi(app, { ...ctx, triggerHealing, cookieSecure: process.env.OURO_COOKIE_SECURE === "true" });

  // Internal heavy-work endpoint (target of the Cloudflare DispatchRunner)
  app.route("/", createRunnerEndpoint(ctx));

  // Static GUI (built Nuxt output). Falls back to index.html for SPA routes.
  const guiDir = resolve(process.env.OURO_GUI_DIR ?? "/app/web/.output/public");
  if (existsSync(guiDir)) {
    app.use("/*", serveStatic({ root: guiDir }));
    app.get("/*", serveStatic({ path: "index.html", root: guiDir }));
    ctx.logger.info(`serving GUI from ${guiDir}`);
  } else {
    app.get("/", (c) => c.json({ service: "ouroboros", gui: "not built", api: "/api/v1/health" }));
  }

  startCron(ctx, () => triggerHealing({ trigger: "cron", dryRun: false }));

  const port = Number(process.env.PORT ?? "3000");
  serve({ fetch: app.fetch, port });
  ctx.logger.info(`Ouroboros self-hosted server listening on :${port}`);
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});
