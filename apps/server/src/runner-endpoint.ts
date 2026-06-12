import { Hono } from "hono";
import type { ServerContext } from "./context";

/**
 * Internal endpoint that performs the filesystem/git/compiler-heavy healing
 * work. The Cloudflare DispatchRunner POSTs here from inside a Workflow, so the
 * edge deployment can offload the parts it cannot run on Workers. Protected by
 * a shared secret (RUNNER_SHARED_SECRET).
 */
export function createRunnerEndpoint(ctx: ServerContext): Hono {
  const app = new Hono();
  const secret = process.env.RUNNER_SHARED_SECRET ?? "";

  app.use("/internal/*", async (c, next) => {
    const provided = c.req.header("x-runner-secret");
    if (!secret || provided !== secret) return c.json({ error: "forbidden" }, 403);
    await next();
  });

  app.post("/internal/scan", async (c) => {
    const result = await ctx.ports.runner.scan();
    return c.json(result.findings);
  });

  app.post("/internal/heal", async (c) => {
    const body = await c.req.json<{ group: unknown; dryRun?: boolean }>();
    const result = await ctx.ports.runner.applyFix({
      group: body.group as never,
      baseBranch: ctx.config.vcs.baseBranch,
      branchPrefix: ctx.config.vcs.branchPrefix,
      dryRun: body.dryRun ?? false,
    });
    return c.json(result);
  });

  return app;
}
