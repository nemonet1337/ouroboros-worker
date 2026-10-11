import { createServer, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./env";
import { buildContext } from "./context";
import { buildApp } from "./app";
import { runScheduledTick } from "./cron";

/** ビルド成果物の CSS を読む。未ビルド時は空文字（スタイル無しで動く）。 */
function loadTailwindCss(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "ui/styles/tailwind.generated.css"), "utf8");
  } catch {
    return "";
  }
}

/** node:http のリクエストを Hono の fetch に渡せる Request へ変換する。 */
function toRequest(req: IncomingMessage): Request {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const init: RequestInit & { duplex?: "half" } = { method: req.method ?? "GET", headers };
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // Node の Readable は undici の BodyInit としては扱えないため ReadableStream に橋渡しする
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        req.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        req.on("end", () => controller.close());
        req.on("error", (err) => controller.error(err));
      },
    });
    init.body = stream;
    init.duplex = "half";
  }
  return new Request(url, init);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = await buildContext(config);
  const app = await buildApp(config, ctx, loadTailwindCss());

  const server = createServer((req, res) => {
    void (async () => {
      let response: Response;
      try {
        response = await app.fetch(toRequest(req));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[server] unhandled error:", message);
        if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "server_error", message } }));
        return;
      }
      const body = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(body);
    })();
  });

  server.listen(config.port, () => {
    console.log(`[server] ouroboros listening on http://127.0.0.1:${config.port}`);
  });

  // 1 時間ごとの cron（stale sweep + 定期 healing）
  const cron = setInterval(() => {
    runScheduledTick(config, ctx).catch((err: unknown) => {
      console.error("[cron] tick failed:", err instanceof Error ? err.message : err);
    });
  }, 60 * 60 * 1000);
  cron.unref?.();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] ${signal} received, shutting down`);
    clearInterval(cron);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await ctx.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
