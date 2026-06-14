import type { VectorizePort } from "../ports/vectorize";
import type { InspectionAspect, InspectionResult } from "../types/inspection.types";
import { ASPECTS } from "./aspects";

/** Minimum number of past results required before adjusting weights. */
const MIN_SAMPLES = 3;

/** How much the data-driven component influences the final weights (0–1). */
const BLEND_FACTOR = 0.3;

/**
 * Learns from past inspection results stored in Vectorize and suggests
 * per-aspect weight adjustments for future inspections.
 *
 * Storage format: a 32-dimensional vector of normalised per-aspect scores
 * (score / 100), keyed by inspection result ID. The 32 aspects map exactly onto
 * Cloudflare Vectorize's minimum dimension count, so no padding is needed.
 * Metadata: { language, overall, <aspect>: rawScore (0–100) × 32 }.
 */
export class WeightAdvisor {
  constructor(private readonly vectorize: VectorizePort) {}

  /**
   * Persist an inspection result as a 32-dim vector. Fire-and-forget; errors are
   * swallowed so they never block the main inspection response.
   */
  async store(result: InspectionResult): Promise<void> {
    try {
      const { aspectBreakdown } = result.scoreCard;
      const values = ASPECTS.map((a) => aspectBreakdown[a].score / 100);
      const metadata: Record<string, string | number | boolean> = {
        language: result.language ?? "unknown",
        overall: result.scoreCard.overall,
      };
      for (const a of ASPECTS) {
        metadata[a] = aspectBreakdown[a].score;
      }
      await this.vectorize.upsert([{ id: result.id, values, metadata }]);
    } catch (err) {
      console.warn("[WeightAdvisor] store failed (non-fatal):", err);
    }
  }

  /**
   * Query Vectorize for past inspections and derive blended per-aspect weights.
   * Returns `defaultWeights` unchanged when there are fewer than MIN_SAMPLES results.
   */
  async suggestWeights(
    defaultWeights: Record<InspectionAspect, number>
  ): Promise<Record<InspectionAspect, number>> {
    try {
      // Neutral 32-dim query vector to retrieve a representative sample of past data.
      const neutralVector = ASPECTS.map(() => 0.5);
      const matches = await this.vectorize.query(neutralVector, { topK: 50 });

      if (matches.length < MIN_SAMPLES) return defaultWeights;

      // Per-aspect average score across matched results.
      const avgScores = {} as Record<InspectionAspect, number>;
      for (const a of ASPECTS) {
        const scores = matches.map((m) => (m.metadata?.[a] as number | undefined) ?? 50);
        avgScores[a] = scores.reduce((x, y) => x + y, 0) / scores.length;
      }

      // Aspects with lower average scores get a proportionally higher raw weight.
      const rawWeights = {} as Record<InspectionAspect, number>;
      for (const a of ASPECTS) {
        rawWeights[a] = Math.max(0.001, (100 - avgScores[a]) / 100);
      }
      const rawTotal = (Object.values(rawWeights) as number[]).reduce((x, y) => x + y, 0);

      // Blend: (1 - BLEND_FACTOR) × default + BLEND_FACTOR × data-driven.
      const blended = {} as Record<InspectionAspect, number>;
      for (const a of ASPECTS) {
        const dataDriven = rawWeights[a] / rawTotal;
        blended[a] = (1 - BLEND_FACTOR) * defaultWeights[a] + BLEND_FACTOR * dataDriven;
      }

      // Renormalise so the 32 weights sum to 1.
      const blendTotal = (Object.values(blended) as number[]).reduce((x, y) => x + y, 0);
      for (const a of ASPECTS) {
        blended[a] = blended[a] / blendTotal;
      }

      return blended;
    } catch (err) {
      console.warn("[WeightAdvisor] suggestWeights failed (non-fatal):", err);
      return defaultWeights;
    }
  }
}
