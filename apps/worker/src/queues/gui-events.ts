import type { GuiEvent } from "@ouroboros/core";
import type { Env } from "../env";
import { buildContext } from "../context";

/**
 * Cloudflare Queues consumer for GUI-originated events. Healing requests start
 * a durable Workflow instance; other events are processed inline.
 */
export async function handleGuiEvents(batch: MessageBatch<GuiEvent>, env: Env): Promise<void> {
  const ctx = buildContext(env);
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
