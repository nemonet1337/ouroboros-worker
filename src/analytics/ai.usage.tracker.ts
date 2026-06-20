import type { AnalyticsEngineDataset } from "../env";

export const AI_USAGE_EVENTS = {
  PROMPT_TOKENS: "prompt_tokens",
  COMPLETION_TOKENS: "completion_tokens",
  MODEL: "model",
  DURATION_MS: "duration_ms",
} as const;

export class AiUsageTracker {
  constructor(private readonly dataset?: AnalyticsEngineDataset) {}

  record(opts: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
  }): void {
    if (!this.dataset) return;
    this.dataset.writeDataPoint({
      indexes: [opts.model],
      doubles: [opts.promptTokens, opts.completionTokens, opts.durationMs],
      blobs: ["ai_usage"],
    });
  }
}

export class CostEstimator {
  private readonly COST_PER_1K_TOKENS: Record<string, { prompt: number; completion: number }> = {
    "moonshotai/kimi-k2": { prompt: 0.001, completion: 0.002 },
    "minimax/m3": { prompt: 0.001, completion: 0.002 },
  };

  estimate(model: string, promptTokens: number, completionTokens: number): number {
    const c = this.COST_PER_1K_TOKENS[model];
    if (!c) return 0;
    return (promptTokens * c.prompt + completionTokens * c.completion) / 1000;
  }
}