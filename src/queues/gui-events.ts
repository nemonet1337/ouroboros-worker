import type { GuiEvent } from "../ports/queue";
import type { Env } from "../env";
import { buildContext } from "../context";
import { SettingsRepository } from "../db/repositories";
import { getRoutingConfig } from "../config/settings.keys";
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
              phase: event.payload.phase === "fix" ? "fix" : "analyze",
              autoFix: Boolean(event.payload.autoFix),
              instruction:
                typeof event.payload.instruction === "string" ? event.payload.instruction : undefined,
            },
          });
          await log.info("started healing workflow", {
            runId: event.payload.runId,
            phase: String(event.payload.phase ?? "analyze"),
          });
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
        case "codegen.requested": {
          const sessionId = String(event.payload.sessionId ?? "");
          const userId = event.userId ?? "";
          if (!sessionId || !userId) {
            await log.error("codegen.requested missing sessionId/userId", {});
            break;
          }
          const settings = new SettingsRepository(ctx.ports.db);
          const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.codeRunner);
          // モデルが明示されていれば Clef を飛ばす。未指定なら Runner 側で判定する。
          const model = typeof event.payload.model === "string" ? event.payload.model : undefined;
          await manager.generate(sessionId, userId, {
            model,
            routing: await getRoutingConfig(settings),
            ...(model ? { modelOverride: true } : {}),
          });
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
