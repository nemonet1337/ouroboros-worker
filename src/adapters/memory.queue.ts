import type { GuiEvent, QueueAdapter } from "../ports/queue";

export interface MemoryQueueOptions {
  onEvent: (event: GuiEvent) => Promise<void>;
}

/**
 * インメモリキュー。同時実行 1 の逐次ワーカー。
 * 失敗時は指数バックオフで最大 3 回リトライし、それでもダメなら
 * console.error に流す（ローカル DLQ 相当）。
 * 未処理イベントはプロセス停止で失われるが、DB の status で再実行できる。
 */
export class MemoryQueue implements QueueAdapter {
  readonly kind = "memory" as const;
  #queue: GuiEvent[] = [];
  #processing = false;
  #stopped = false;
  #timer?: NodeJS.Timeout;
  static readonly MAX_RETRIES = 3;

  constructor(private readonly opts: MemoryQueueOptions) {}

  send(event: GuiEvent): Promise<void> {
    if (this.#stopped) return Promise.resolve();
    this.#queue.push(event);
    void this.#process();
    return Promise.resolve();
  }

  /** キューが空になるまで待つ（graceful shutdown 用）。 */
  async drain(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((this.#queue.length > 0 || this.#processing) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
  }

  async #process(): Promise<void> {
    if (this.#processing) return;
    this.#processing = true;
    try {
      while (this.#queue.length > 0) {
        const event = this.#queue.shift()!;
        for (let attempt = 1; attempt <= MemoryQueue.MAX_RETRIES; attempt++) {
          try {
            await this.opts.onEvent(event);
            break;
          } catch (err) {
            if (attempt >= MemoryQueue.MAX_RETRIES) {
              console.error("[queue] event failed after retries:", event.type, err);
              break;
            }
            console.warn(
              `[queue] event failed (attempt ${attempt}/${MemoryQueue.MAX_RETRIES}):`,
              err instanceof Error ? err.message : err
            );
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
          }
        }
      }
    } finally {
      this.#processing = false;
    }
  }
}
