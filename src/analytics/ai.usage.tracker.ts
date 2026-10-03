import type { AnalyticsEngineDataset } from "../env";

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