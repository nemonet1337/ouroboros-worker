import type { QueueAdapter, GuiEvent } from "../ports";

/** QueueAdapter producing to a Cloudflare Queue. */
export class CfQueueAdapter implements QueueAdapter {
  readonly kind = "cf-queue" as const;

  constructor(private readonly queue: Queue<GuiEvent>) {}

  async send(event: GuiEvent): Promise<void> {
    await this.queue.send(event);
  }
}
