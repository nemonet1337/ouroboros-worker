export type GuiEventType =
  | "inspection.requested"
  | "healing.requested"
  | "codegen.requested";

export interface GuiEvent {
  id: string;
  type: GuiEventType;
  userId?: string;
  payload: Record<string, unknown>;
  enqueuedAt: number;
}
