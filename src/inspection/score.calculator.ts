import {
  AspectBreakdown,
  Grade,
  InspectionAspect,
  InspectionCategory,
  Score,
  ScoreBreakdown,
  ScoreCard,
} from "../types";
import { InspectionConfig } from "../config/inspection.config";
import { ASPECTS, ASPECTS_BY_CATEGORY, ASPECT_CATEGORY } from "./aspects";

export const CATEGORIES: InspectionCategory[] = [
  "security",
  "performance",
  "redundancy",
  "readability",
  "design",
  "correctness",
];

export function deriveGrade(
  score: Score,
  thresholds: InspectionConfig["scoring"]["gradeThresholds"]
): Grade {
  if (score >= thresholds.S) return "S";
  if (score >= thresholds.A) return "A";
  if (score >= thresholds.B) return "B";
  if (score >= thresholds.C) return "C";
  if (score >= thresholds.D) return "D";
  return "F";
}

/**
 * Build a ScoreCard from the AI's per-aspect breakdown.
 *
 * - overall      = Σ(aspectScore × aspectWeight)
 * - category     = Σ_child(aspectScore × aspectWeight) / Σ_child(aspectWeight)
 *                  (the weight-normalised average of the category's child aspects)
 * - categoryWt   = Σ_child(aspectWeight)
 *
 * The resulting `breakdown` (6 categories) stays consistent with `overall`,
 * since Σ_cat(categoryScore × categoryWeight) == Σ_aspect(aspectScore × aspectWeight).
 */
export function calculateScoreCard(
  aiAspects: Record<InspectionAspect, { score: number; summary: string }>,
  aspectWeights: Record<InspectionAspect, number>,
  thresholds: InspectionConfig["scoring"]["gradeThresholds"]
): ScoreCard {
  const aspectBreakdown = {} as AspectBreakdown;
  let overall = 0;

  for (const aspect of ASPECTS) {
    const score = clamp(aiAspects[aspect]?.score ?? 0);
    const weight = aspectWeights[aspect] ?? 0;
    aspectBreakdown[aspect] = {
      score,
      weight,
      summary: aiAspects[aspect]?.summary ?? "",
      category: ASPECT_CATEGORY[aspect],
    };
    overall += score * weight;
  }

  const breakdown = rollUpCategories(aspectBreakdown, aspectWeights);
  const roundedOverall = Math.round(overall);
  return {
    overall: roundedOverall,
    grade: deriveGrade(roundedOverall, thresholds),
    breakdown,
    aspectBreakdown,
  };
}

/** Roll the 32-aspect breakdown up into the 6 parent-category dimensions. */
function rollUpCategories(
  aspectBreakdown: AspectBreakdown,
  aspectWeights: Record<InspectionAspect, number>
): ScoreBreakdown {
  const breakdown = {} as ScoreBreakdown;

  for (const cat of CATEGORIES) {
    const children = ASPECTS_BY_CATEGORY[cat];
    const catWeight = children.reduce((s, a) => s + (aspectWeights[a] ?? 0), 0);
    const weightedScore = children.reduce(
      (s, a) => s + aspectBreakdown[a].score * (aspectWeights[a] ?? 0),
      0
    );
    const score = catWeight > 0 ? weightedScore / catWeight : 0;

    // Surface the worst-scoring child aspect's summary at the category level.
    const worst = children.reduce((w, a) =>
      aspectBreakdown[a].score < aspectBreakdown[w].score ? a : w
    );

    breakdown[cat] = {
      score: Math.round(score),
      weight: catWeight,
      summary: aspectBreakdown[worst].summary,
    };
  }

  return breakdown;
}

/**
 * Average per-file ScoreCards into a single project-level ScoreCard.
 * Aspects are averaged across files; the summary for each aspect is taken from
 * the worst-scoring file so the most critical issue surfaces at the top level.
 */
export function aggregateScoreCards(
  fileCards: ScoreCard[],
  aspectWeights: Record<InspectionAspect, number>,
  thresholds: InspectionConfig["scoring"]["gradeThresholds"]
): ScoreCard {
  if (fileCards.length === 0) {
    const empty = {} as Record<InspectionAspect, { score: number; summary: string }>;
    for (const aspect of ASPECTS) {
      empty[aspect] = { score: 100, summary: "対象ファイルなし" };
    }
    return calculateScoreCard(empty, aspectWeights, thresholds);
  }

  const avgAspects = {} as Record<InspectionAspect, { score: number; summary: string }>;
  for (const aspect of ASPECTS) {
    const avgScore =
      fileCards.reduce((sum, c) => sum + c.aspectBreakdown[aspect].score, 0) / fileCards.length;
    const worstCard = fileCards.reduce((worst, c) =>
      c.aspectBreakdown[aspect].score < worst.aspectBreakdown[aspect].score ? c : worst
    );
    avgAspects[aspect] = {
      score: Math.round(avgScore),
      summary: worstCard.aspectBreakdown[aspect].summary,
    };
  }

  return calculateScoreCard(avgAspects, aspectWeights, thresholds);
}

function clamp(v: number): Score {
  return Math.min(100, Math.max(0, v));
}
