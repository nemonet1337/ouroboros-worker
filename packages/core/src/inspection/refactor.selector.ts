import {
  CodeLocation,
  FileResult,
  FindingSeverity,
  InspectionCategory,
  InspectionFinding,
  InspectionResult,
  Recommendation,
  RefactorCandidate,
  RefactorPriority,
  ScoreCard,
} from "../types/inspection.types";
import { CATEGORIES } from "./score.calculator";

export interface RefactorSelectorConfig {
  /** Units with an overall score below this are candidates */
  overallThreshold: number;
  /** Units with any dimension score below this are candidates */
  dimensionThreshold: number;
  /** Dimension weights used to scale per-dimension deficits */
  weights: Record<InspectionCategory, number>;
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  critical: 12,
  high: 8,
  medium: 4,
  low: 1.5,
  info: 0,
};

/**
 * Heuristically select which units (methods/classes when function granularity
 * was requested, otherwise files) should be refactored, based on the weighted
 * score card and finding severities, and rank them by urgency.
 *
 * priorityScore = Σ_dim weight[dim] * max(0, dimensionThreshold - score[dim])
 *               + Σ_findings severityWeight(severity)
 */
export function selectRefactorCandidates(
  result: Pick<InspectionResult, "files">,
  cfg: RefactorSelectorConfig
): RefactorCandidate[] {
  const candidates: RefactorCandidate[] = [];

  for (const file of result.files) {
    if (file.functions?.length) {
      for (const fn of file.functions) {
        const candidate = evaluateUnit({
          unit: "function",
          name: fn.name,
          location: fn.location,
          scoreCard: fn.scoreCard,
          findings: fn.findings,
          recommendations: fn.recommendations,
          cfg,
        });
        if (candidate) candidates.push(candidate);
      }
    } else {
      const candidate = evaluateUnit({
        unit: "file",
        name: file.path,
        location: fileLocation(file),
        scoreCard: file.scoreCard,
        findings: file.findings,
        recommendations: file.recommendations,
        cfg,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => b.priorityScore - a.priorityScore);
}

function evaluateUnit(args: {
  unit: "function" | "file";
  name: string;
  location: CodeLocation;
  scoreCard: ScoreCard;
  findings: InspectionFinding[];
  recommendations: Recommendation[];
  cfg: RefactorSelectorConfig;
}): RefactorCandidate | null {
  const { unit, name, location, scoreCard, findings, recommendations, cfg } = args;

  const weakest: Array<{ cat: InspectionCategory; deficit: number }> = [];
  let dimensionPenalty = 0;
  for (const cat of CATEGORIES) {
    const dim = scoreCard.breakdown[cat];
    if (!dim) continue;
    const deficit = Math.max(0, cfg.dimensionThreshold - dim.score);
    if (deficit > 0) {
      weakest.push({ cat, deficit });
      dimensionPenalty += (cfg.weights[cat] ?? 0) * deficit;
    }
  }

  const belowOverall = scoreCard.overall < cfg.overallThreshold;
  if (!belowOverall && weakest.length === 0) return null;

  const findingPenalty = findings.reduce(
    (sum, f) => sum + (SEVERITY_WEIGHT[f.severity] ?? 0),
    0
  );
  const priorityScore = round2(dimensionPenalty + findingPenalty);
  const weakestDimensions = weakest
    .sort((a, b) => b.deficit - a.deficit)
    .map((w) => w.cat);

  return {
    unit,
    name,
    location,
    scoreCard,
    priority: toPriority(priorityScore),
    priorityScore,
    weakestDimensions,
    recommendations,
    rationale: buildRationale(scoreCard, weakestDimensions, belowOverall, cfg),
  };
}

function toPriority(priorityScore: number): RefactorPriority {
  if (priorityScore >= 20) return "critical";
  if (priorityScore >= 10) return "high";
  if (priorityScore >= 4) return "medium";
  return "low";
}

function buildRationale(
  scoreCard: ScoreCard,
  weakest: InspectionCategory[],
  belowOverall: boolean,
  cfg: RefactorSelectorConfig
): string {
  const parts: string[] = [];
  if (belowOverall) {
    parts.push(`総合スコア ${scoreCard.overall} が基準値 ${cfg.overallThreshold} を下回っています`);
  }
  if (weakest.length > 0) {
    const dims = weakest
      .map((cat) => `${cat}: ${scoreCard.breakdown[cat]?.score ?? "-"}`)
      .join("、");
    parts.push(`次元スコアが基準値 ${cfg.dimensionThreshold} 未満（${dims}）`);
  }
  return `${parts.join("。")}。`;
}

function fileLocation(file: FileResult): CodeLocation {
  const lastLine = file.findings.reduce((max, f) => Math.max(max, f.location.endLine), 1);
  return { file: file.path, startLine: 1, endLine: lastLine, snippet: "" };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
