export interface UsageSnapshot {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/** Per-isolate / per-step AI usage totals. WorkersAiProvider.onUsage から足し込む。 */
export class UsageAccumulator {
  #promptTokens = 0;
  #completionTokens = 0;
  #model = "";

  record(event: { model: string; promptTokens: number; completionTokens: number }): void {
    this.#promptTokens += event.promptTokens;
    this.#completionTokens += event.completionTokens;
    if (event.model) this.#model = event.model;
  }

  snapshot(): UsageSnapshot {
    return {
      model: this.#model,
      promptTokens: this.#promptTokens,
      completionTokens: this.#completionTokens,
    };
  }

  reset(): void {
    this.#promptTokens = 0;
    this.#completionTokens = 0;
    this.#model = "";
  }
}
