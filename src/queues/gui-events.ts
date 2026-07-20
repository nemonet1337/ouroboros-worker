import type { GuiEvent } from "../ports/queue";
import type { Env } from "../env";
import { buildContext } from "../context";
import { CodeIndexer } from "../vectorize/code.indexer";
import { SettingsRepository } from "../db/repositories";
import { GitHubProvider } from "../vcs/github.provider";
import { runInspectionPipeline } from "../inspection/pipeline";

/**
 * Cloudflare Queues consumer for GUI-originated events. Healing requests start
 * a durable Workflow instance; other events are processed inline.
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
            ctx.ports.vcs as GitHubProvider,
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
        default:
          await log.info("processed gui event", { type: event.type, id: event.id });
      }
      message.ack();
    } catch (err) {
      await log.error("gui event failed", { type: event.type, reason: (err as Error).message });
      message.retry();
    }
  }
}
