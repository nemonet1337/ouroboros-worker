import type { VectorizePort } from "../ports/vectorize";
import type { InspectionCategory, InspectionResult } from "../types/inspection.types";
import { CATEGORIES } from "./score.calculator";

/** Minimum number of past results required before adjusting weights. */
const MIN_SAMPLES = 3;

/** How much the data-driven component influences the final weights (0–1). */
const BLEND_FACTOR = 0.3;

/**
 * Learns from past inspection results stored in Vectorize and suggests
 * per-language weight adjustments for future inspections.
 *
 * Storage format: 6-dimensional vector of normalised per-category scores
 * (score / 100), keyed by inspection result ID.
 * Metadata: { language, overall, security, performance, ... (raw 0–100 scores) }
 */
export class WeightAdvisor {
  constructor(private readonly vectorize: VectorizePort) {}

  /**
   * Persist an inspection result as a vector. Fire-and-forget; errors are
   * swallowed so they never block the main inspection response.
   */
  async store(result: InspectionResult): Promise<void> {
    try {
      const { breakdown } = result.scoreCard;
      const values = CATEGORIES.map((cat) => breakdown[cat].score / 100);
      const metadata: Record<string, string | number | boolean> = {
        language: result.language ?? "unknown",
        overall: result.scoreCard.overall,
      };
      for (const cat of CATEGORIES) {
        metadata[cat] = breakdown[cat].score;
      }
      await this.vectorize.upsert([{ id: result.id, values, metadata }]);
    } catch (err) {
      console.warn("[WeightAdvisor] store failed (non-fatal):", err);
    }
  }

  /**
   * Query Vectorize for past inspections and derive blended weights.
   * Returns `defaultWeights` unchanged when there are fewer than MIN_SAMPLES results.
   */
  async suggestWeights(
    defaultWeights: Record<InspectionCategory, number>
  ): Promise<Record<InspectionCategory, number>> {
    try {
      // Neutral query vector to retrieve a representative sample of past data.
      const neutralVector = CATEGORIES.map(() => 0.5);
      const matches = await this.vectorize.query(neutralVector, { topK: 20 });

      if (matches.length < MIN_SAMPLES) return defaultWeights;

      // Compute per-category average score across matched results.
      const avgScores: Record<InspectionCategory, number> = {} as Record<InspectionCategory, number>;
      for (const cat of CATEGORIES) {
        const scores = matches.map((m) => (m.metadata?.[cat] as number | undefined) ?? 50);
        avgScores[cat] = scores.reduce((a, b) => a + b, 0) / scores.length;
      }

      // Dimensions with lower average scores get a proportionally higher weight.
      const rawWeights: Record<InspectionCategory, number> = {} as Record<InspectionCategory, number>;
      for (const cat of CATEGORIES) {
        rawWeights[cat] = Math.max(0.01, (100 - avgScores[cat]) / 100);
      }
      const rawTotal = (Object.values(rawWeights) as number[]).reduce((a, b) => a + b, 0);

      // Blend: (1 - BLEND_FACTOR) × default + BLEND_FACTOR × data-driven
      const blended: Record<InspectionCategory, number> = {} as Record<InspectionCategory, number>;
      for (const cat of CATEGORIES) {
        const dataDriven = rawWeights[cat] / rawTotal;
        blended[cat] = (1 - BLEND_FACTOR) * defaultWeights[cat] + BLEND_FACTOR * dataDriven;
      }

      // Renormalise so weights sum to 1.
      const blendTotal = (Object.values(blended) as number[]).reduce((a, b) => a + b, 0);
      for (const cat of CATEGORIES) {
        blended[cat] = blended[cat] / blendTotal;
      }

      return blended;
    } catch (err) {
      console.warn("[WeightAdvisor] suggestWeights failed (non-fatal):", err);
      return defaultWeights;
    }
  }
}
