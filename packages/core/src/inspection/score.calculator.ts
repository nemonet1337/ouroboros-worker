import {
  Grade,
  InspectionCategory,
  Score,
  ScoreBreakdown,
  ScoreCard,
} from "../types/inspection.types";
import { InspectionConfig } from "../config/inspection.config";

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

/** Build a ScoreCard from the AI's per-dimension breakdown */
export function calculateScoreCard(
  aiBreakdown: Record<InspectionCategory, { score: number; summary: string }>,
  weights: Record<InspectionCategory, number>,
  thresholds: InspectionConfig["scoring"]["gradeThresholds"]
): ScoreCard {
  const breakdown = {} as ScoreBreakdown;
  let overall = 0;

  for (const cat of CATEGORIES) {
    const score = clamp(aiBreakdown[cat].score);
    breakdown[cat] = { score, weight: weights[cat], summary: aiBreakdown[cat].summary };
    overall += score * weights[cat];
  }

  const roundedOverall = Math.round(overall);
  return {
    overall: roundedOverall,
    grade: deriveGrade(roundedOverall, thresholds),
    breakdown,
  };
}

/**
 * Average per-file ScoreCards into a single project-level ScoreCard.
 * The summary for each dimension is taken from the worst-scoring file
 * so the most critical issue is surfaced at the top level.
 */
export function aggregateScoreCards(
  fileCards: ScoreCard[],
  weights: Record<InspectionCategory, number>,
  thresholds: InspectionConfig["scoring"]["gradeThresholds"]
): ScoreCard {
  if (fileCards.length === 0) {
    const breakdown = {} as ScoreBreakdown;
    for (const cat of CATEGORIES) {
      breakdown[cat] = { score: 100, weight: weights[cat], summary: "対象ファイルなし" };
    }
    return { overall: 100, grade: "S", breakdown };
  }

  const avgBreakdown = {} as Record<InspectionCategory, { score: number; summary: string }>;

  for (const cat of CATEGORIES) {
    const avgScore =
      fileCards.reduce((sum, c) => sum + c.breakdown[cat].score, 0) / fileCards.length;
    const worstCard = fileCards.reduce((worst, c) =>
      c.breakdown[cat].score < worst.breakdown[cat].score ? c : worst
    );
    avgBreakdown[cat] = {
      score: Math.round(avgScore),
      summary: worstCard.breakdown[cat].summary,
    };
  }

  return calculateScoreCard(avgBreakdown, weights, thresholds);
}

function clamp(v: number): Score {
  return Math.min(100, Math.max(0, v));
}
