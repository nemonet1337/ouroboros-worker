import {
  InspectionResult,
  WebhookThresholdBreach,
} from "../types/inspection.types";
import { ScoreThresholdConfig } from "./types";
import { CATEGORIES } from "../inspection/score.calculator";

/**
 * Compare each score dimension against configured thresholds.
 * Returns one breach entry per failing dimension.
 */
export function evaluateThresholds(
  result: InspectionResult,
  thresholds: ScoreThresholdConfig
): WebhookThresholdBreach[] {
  const breaches: WebhookThresholdBreach[] = [];

  if (
    thresholds.overall !== undefined &&
    result.scoreCard.overall < thresholds.overall
  ) {
    breaches.push({
      category: "overall",
      threshold: thresholds.overall,
      actual: result.scoreCard.overall,
    });
  }

  for (const cat of CATEGORIES) {
    const threshold = thresholds[cat];
    if (threshold === undefined) continue;
    const actual = result.scoreCard.breakdown[cat].score;
    if (actual < threshold) {
      breaches.push({ category: cat, threshold, actual });
    }
  }

  return breaches;
}
