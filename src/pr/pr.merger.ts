import { HealingConfig } from "../config/healing.config";
import type { AiProvider } from "../ports/ai";
import type { VcsProvider } from "../ports/vcs";
import { PRReviewer } from "./pr.reviewer";

/**
 * Auto-merge gate: waits for CI, runs an AI safety review, then squash-merges.
 * VCS/AI-agnostic via ports.
 */
export class PRMerger {
  constructor(
    private readonly config: HealingConfig,
    private readonly vcs: VcsProvider,
    private readonly ai: AiProvider
  ) {}

  async mergeIfEligible(prNumber: number): Promise<boolean> {
    if (!this.config.autoMerge.enabled) return false;

    if (this.config.autoMerge.requireCIPass) {
      const ciOk = await this.waitForCI(prNumber);
      if (!ciOk) return false;
    }

    const review = await new PRReviewer(this.config, this.ai, this.vcs).review(prNumber);
    if (!review.autoMergeEligible) {
      console.log(`[PRMerger] review not eligible: ${review.summary}`);
      return false;
    }

    const merged = await this.vcs.mergePR(prNumber, "squash");
    return merged;
  }

  private async waitForCI(prNumber: number, timeoutMs = 30 * 60_000, intervalMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.vcs.getPRChecks(prNumber);
      if (status.state === "success") return true;
      if (status.state === "failure") return false;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }
}
