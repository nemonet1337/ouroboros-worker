import type { QueueAdapter, GuiEvent, GuiEventHandler } from "@ouroboros/core";

/**
 * In-memory async queue for the self-hosted deployment. Events are processed
 * on the next tick by the registered handler; failures are logged, not retried.
 */
export class InProcessQueue implements QueueAdapter {
  readonly kind = "in-process" as const;
  private handler?: GuiEventHandler;

  setHandler(handler: GuiEventHandler): void {
    this.handler = handler;
  }

  async send(event: GuiEvent): Promise<void> {
    queueMicrotask(async () => {
      if (!this.handler) return;
      try {
        await this.handler(event);
      } catch (err) {
        console.error(`[InProcessQueue] handler failed for ${event.type}:`, err);
      }
    });
  }
}
