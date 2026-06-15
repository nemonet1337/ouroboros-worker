import {
  InspectionResult,
  WebhookEvent,
  WebhookPayload,
  WebhookThresholdBreach,
} from "../types";
import { WebhookDeliveryResult, WebhookEndpoint } from "../types";
import { evaluateThresholds } from "./threshold.evaluator";
import { dispatch } from "./dispatcher";
import { toSlackPayload } from "./adapters/slack.adapter";
import { toDiscordPayload } from "./adapters/discord.adapter";
import { toGitHubPayload } from "./adapters/github.adapter";
import { toGenericPayload } from "./adapters/generic.adapter";

export interface DispatchContext {
  /** Deep-link to the WebUI result page; included in the payload when set */
  resultUrl?: string;
  /** Language of the inspected code; used in error payloads */
  language?: string;
  /** Grade from the inspection; used in error payloads */
  grade?: string;
}

export class WebhookManager {
  /**
   * Evaluate thresholds, determine which events fire, and deliver to all
   * matching enabled endpoints concurrently.
   */
  async dispatch(
    result: InspectionResult,
    endpoints: WebhookEndpoint[],
    ctx: DispatchContext = {}
  ): Promise<WebhookDeliveryResult[]> {
    const active = endpoints.filter((e) => e.enabled);
    if (active.length === 0) return [];

    const jobs: Promise<WebhookDeliveryResult>[] = [];

    for (const endpoint of active) {
      if (endpoint.events.includes("inspection.completed")) {
        const payload = this.buildPayload(result, "inspection.completed", [], ctx.resultUrl);
        jobs.push(this.deliverOne(payload, endpoint, "inspection.completed"));
      }

      if (
        endpoint.events.includes("inspection.threshold_breached") &&
        endpoint.scoreThresholds
      ) {
        const breaches = evaluateThresholds(result, endpoint.scoreThresholds);
        if (breaches.length > 0) {
          const payload = this.buildPayload(
            result,
            "inspection.threshold_breached",
            breaches,
            ctx.resultUrl
          );
          jobs.push(this.deliverOne(payload, endpoint, "inspection.threshold_breached"));
        }
      }
    }

    const settled = await Promise.allSettled(jobs);
    return settled
      .filter(
        (r): r is PromiseFulfilledResult<WebhookDeliveryResult> => r.status === "fulfilled"
      )
      .map((r) => r.value);
  }

  /**
   * Notify endpoints that subscribed to inspection.failed when the engine throws.
   */
  async dispatchError(
    error: string,
    requestId: string,
    endpoints: WebhookEndpoint[],
    ctx: DispatchContext = {}
  ): Promise<WebhookDeliveryResult[]> {
    const active = endpoints.filter(
      (e) => e.enabled && e.events.includes("inspection.failed")
    );
    if (active.length === 0) return [];

    const payload: WebhookPayload = {
      event: "inspection.failed",
      triggeredAt: new Date().toISOString(),
      inspection: {
        id: requestId,
        language: (ctx.language ?? "unknown") as never,
        scoreCard: { overall: 0, grade: (ctx.grade ?? "F") as "F" },
        summary: `インスペクションの実行中にエラーが発生しました。`,
        findingCount: 0,
        recommendationCount: 0,
        ...(ctx.resultUrl ? { url: ctx.resultUrl } : {}),
      },
      error,
    };

    const settled = await Promise.allSettled(
      active.map((e) => this.deliverOne(payload, e, "inspection.failed"))
    );

    return settled
      .filter(
        (r): r is PromiseFulfilledResult<WebhookDeliveryResult> => r.status === "fulfilled"
      )
      .map((r) => r.value);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private buildPayload(
    result: InspectionResult,
    event: WebhookEvent,
    breaches: WebhookThresholdBreach[],
    url?: string
  ): WebhookPayload {
    return {
      event,
      triggeredAt: new Date().toISOString(),
      inspection: {
        id: result.id,
        language: result.language,
        scoreCard: {
          overall: result.scoreCard.overall,
          grade: result.scoreCard.grade,
        },
        summary: result.summary,
        findingCount: result.findings.length,
        recommendationCount: result.recommendations.length,
        ...(url ? { url } : {}),
      },
      ...(breaches.length > 0 ? { breaches } : {}),
    };
  }

  private async deliverOne(
    payload: WebhookPayload,
    endpoint: WebhookEndpoint,
    event: WebhookEvent
  ): Promise<WebhookDeliveryResult> {
    const body = this.adapt(payload, endpoint);
    const result = await dispatch({ body, endpoint, event });

    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      event,
      success: result.success,
      statusCode: result.statusCode,
      error: result.error,
      attemptCount: result.attemptCount,
      deliveredAt: new Date().toISOString(),
    };
  }

  private adapt(
    payload: WebhookPayload,
    endpoint: WebhookEndpoint
  ): Record<string, unknown> {
    switch (endpoint.adapter) {
      case "slack":
        return toSlackPayload(payload);
      case "discord":
        return toDiscordPayload(payload);
      case "github":
        return toGitHubPayload(payload);
      default:
        return toGenericPayload(payload);
    }
  }
}
