export type GuiEventType =
  | "inspection.requested"
  | "inspection.received"
  | "healing.requested"
  | "codegen.requested";

export interface GuiEvent {
  id: string;
  type: GuiEventType;
  userId?: string;
  payload: Record<string, unknown>;
  enqueuedAt: number;
}

/**
 * Async ingestion of GUI-originated events.
 * Implementation: MemoryQueue (in-process sequential worker).
 */
export interface QueueAdapter {
  readonly kind: "memory";
  send(event: GuiEvent): Promise<void>;
}
