import type { GuiEvent } from "../ports/queue";
import type { Env } from "../env";
import { buildContext } from "../context";
import { CodeIndexer } from "../vectorize/code.indexer";
import { CodeSessionRepository, SettingsRepository } from "../db/repositories";
import { GitHubProvider } from "../vcs/github.provider";
import { runInspectionPipeline } from "../inspection/pipeline";
import { CodeSessionManager } from "../code/session.manager";

/**
 * Cloudflare Queues consumer for GUI-originated events.
 * max_batch_size=1 前提。恒久エラーは ack して毒メッセージの無限リトライを防ぐ。
 */
export async function handleGuiEvents(batch: MessageBatch<GuiEvent>, env: Env): Promise<void> {
  const ctx = await buildContext(env);
  const log = ctx.logger.child("queue");

  for (const message of batch.messages) {
    const event = message.body;
    try {
      switch (event.type) {
        case "healing.requested": {
          await env.HEALING_WORKFLOW.create({
            params: {
              runId: String(event.payload.runId ?? crypto.randomUUID()),
              dryRun: Boolean(event.payload.dryRun),
              trigger: String(event.payload.trigger ?? "gui"),
            },
          });
          await log.info("started healing workflow", { runId: event.payload.runId });
          break;
        }
        case "inspection.requested": {
          const inspectionId = String(event.payload.inspectionId ?? "");
          const userId = event.userId ?? "";
          if (!inspectionId || !userId) {
            await log.error("inspection.requested missing inspectionId/userId", {});
            break;
          }
          await runInspectionPipeline({
            ctx,
            log,
            inspectionId,
            userId,
            instruction: String(event.payload.instruction ?? ""),
          });
          break;
        }
        case "codeindex.requested": {
          if (!ctx.ports.vectorize) {
            await log.error("code index requested but VECTORIZE is not bound", {});
            break;
          }
          const indexer = new CodeIndexer(
            ctx.ports.vectorize,
            ctx.ports.ai,
            ctx.ports.vcs as unknown as GitHubProvider,
            new SettingsRepository(ctx.ports.db)
          );
          const status = await indexer.reindex();
          await log.info("code index rebuilt", {
            status: status.status,
            files: status.files,
            chunks: status.chunks,
            error: status.error ?? "",
          });
          break;
        }
        case "codegen.requested": {
          const sessionId = String(event.payload.sessionId ?? "");
          const userId = event.userId ?? "";
          if (!sessionId || !userId) {
            await log.error("codegen.requested missing sessionId/userId", {});
            break;
          }
          const mode =
            event.payload.mode === "code_only" ? ("code_only" as const) : ("plan_code" as const);
          const model = await ctx.auth.resolveModel(userId, "coding");
          const planModel = await ctx.auth.resolveModel(userId, "plan");
          const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.codeRunner, ctx.ports.ai);
          await manager.generate(sessionId, userId, { model, planModel, mode });
          await log.info("codegen complete", { sessionId });
          break;
        }
        default:
          await log.info("processed gui event", { type: event.type, id: event.id });
      }
      message.ack();
    } catch (err) {
      const reason = (err as Error).message ?? String(err);
      await log.error("gui event failed", { type: event.type, reason });
      // 恒久エラーは ack（リトライしても直らない）
      if (/not configured|not found|authentication required|canceled/i.test(reason)) {
        message.ack();
      } else {
        message.retry();
      }
    }
  }
}
