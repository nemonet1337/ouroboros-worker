export interface UsageSnapshot {
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** プロンプトキャッシュからヒットした入力 token 数。 */
  cachedTokens: number;
  /** キャッシュ書き込みで消費した入力 token 数。 */
  cacheWriteTokens: number;
}

/** Per-isolate / per-step AI usage totals. WorkersAiProvider.onUsage から足し込む。 */
export class UsageAccumulator {
  #promptTokens = 0;
  #completionTokens = 0;
  #cachedTokens = 0;
  #cacheWriteTokens = 0;
  #model = "";

  record(event: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    cachedTokens?: number;
    cacheWriteTokens?: number;
  }): void {
    this.#promptTokens += event.promptTokens;
    this.#completionTokens += event.completionTokens;
    this.#cachedTokens += event.cachedTokens ?? 0;
    this.#cacheWriteTokens += event.cacheWriteTokens ?? 0;
    if (event.model) this.#model = event.model;
  }

  snapshot(): UsageSnapshot {
    return {
      model: this.#model,
      promptTokens: this.#promptTokens,
      completionTokens: this.#completionTokens,
      cachedTokens: this.#cachedTokens,
      cacheWriteTokens: this.#cacheWriteTokens,
    };
  }

  reset(): void {
    this.#promptTokens = 0;
    this.#completionTokens = 0;
    this.#cachedTokens = 0;
    this.#cacheWriteTokens = 0;
    this.#model = "";
  }
}