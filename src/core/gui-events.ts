import type { GuiEvent } from "./events";
import type { WorkerContext } from "../context";
import { SettingsRepository } from "../db/repositories";
import { getRoutingConfig } from "../config/settings.keys";
import { runInspectionPipeline } from "../inspection/pipeline";
import { CodeSessionManager } from "../code/session.manager";
import { runHealingLifecycle } from "../healing/lifecycle";

/**
 * GUI 起点イベントの処理。Node の EventDispatcher（逐次）または
 * Cloudflare の Queue consumer から呼ばれる。ctx は呼び出し側が
 * buildContext / buildContextFromBindings で組み立てたものを使う。
 * 恒久エラーは投げっぱなしにせずログに残して次のイベントへ進む。
 */
export async function handleGuiEvents(events: GuiEvent[], ctx: WorkerContext): Promise<void> {
  const log = ctx.logger.child("queue");

  for (const event of events) {
    try {
      switch (event.type) {
        case "healing.requested": {
          const runId = String(event.payload.runId ?? "");
          if (!runId) {
            await log.error("healing.requested missing runId", {});
            continue;
          }
          await log.info("started healing job", {
            runId,
            phase: String(event.payload.phase ?? "analyze"),
          });
          await runHealingLifecycle(
            {
              runId,
              dryRun: Boolean(event.payload.dryRun),
              trigger: String(event.payload.trigger ?? "gui"),
              phase: event.payload.phase === "fix" ? "fix" : "analyze",
              autoFix: Boolean(event.payload.autoFix),
              instruction:
                typeof event.payload.instruction === "string" ? event.payload.instruction : undefined,
            },
            ctx
          );
          break;
        }
        case "inspection.requested": {
          const inspectionId = String(event.payload.inspectionId ?? "");
          const userId = event.userId ?? "";
          if (!inspectionId || !userId) {
            await log.error("inspection.requested missing inspectionId/userId", {});
            continue;
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
            continue;
          }
          const settings = new SettingsRepository(ctx.ports.db);
          const manager = new CodeSessionManager(ctx.ports.db, ctx.ports.runner);
          // モデルが明示されていれば判定を飛ばす。未指定なら Runner 側で判定する。
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
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await log.error("gui event failed", { type: event.type, reason });
    }
  }
}
