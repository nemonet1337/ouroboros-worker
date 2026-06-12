import { InspectionCategory, Score, WebhookEvent } from "../types/inspection.types";

export type WebhookAdapter = "slack" | "discord" | "github" | "generic";

export interface ScoreThresholdConfig {
  overall?: Score;
  security?: Score;
  performance?: Score;
  redundancy?: Score;
  readability?: Score;
  design?: Score;
  correctness?: Score;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  adapter: WebhookAdapter;
  /** Which events trigger this endpoint */
  events: WebhookEvent[];
  /** When set, request body is HMAC-SHA256 signed; signature added as X-Ouroboros-Signature */
  secret?: string;
  /** Extra HTTP headers merged into every request */
  headers?: Record<string, string>;
  enabled: boolean;
  /** Per-endpoint score thresholds; overrides global thresholds for this endpoint */
  scoreThresholds?: ScoreThresholdConfig;
}

export interface WebhookDeliveryResult {
  endpointId: string;
  endpointName: string;
  event: WebhookEvent;
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptCount: number;
  deliveredAt: string;
}
