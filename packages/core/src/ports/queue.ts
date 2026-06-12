export type GuiEventType =
  | "inspection.requested"
  | "healing.requested"
  | "webhook.test"
  | "alert.dispatch";

export interface GuiEvent {
  id: string;
  type: GuiEventType;
  userId?: string;
  payload: Record<string, unknown>;
  enqueuedAt: number;
}

/**
 * Async ingestion of GUI-originated events.
 * Implementations: InProcessQueue (self-hosted), CfQueueAdapter (Cloudflare Queues).
 */
export interface QueueAdapter {
  readonly kind: "in-process" | "cf-queue";
  send(event: GuiEvent): Promise<void>;
}

export type GuiEventHandler = (event: GuiEvent) => Promise<void>;
