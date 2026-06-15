import { WebhookPayload } from "../../types";

/**
 * Pass-through adapter: sends the canonical WebhookPayload (our JSON Schema)
 * without any service-specific transformation.
 */
export function toGenericPayload(payload: WebhookPayload): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}
