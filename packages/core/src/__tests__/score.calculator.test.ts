import { describe, it, expect } from "vitest";
import {
  deriveGrade,
  calculateScoreCard,
  aggregateScoreCards,
} from "../inspection/score.calculator";
import {
  DEFAULT_WEIGHTS,
  DEFAULT_GRADE_THRESHOLDS,
} from "../config/inspection.config";
import { InspectionCategory, ScoreCard } from "../types/inspection.types";

const thresholds = DEFAULT_GRADE_THRESHOLDS;
const weights = DEFAULT_WEIGHTS;

const CATEGORIES: InspectionCategory[] = [
  "security",
  "performance",
  "redundancy",
  "readability",
  "design",
  "correctness",
];

function makeBreakdown(score: number, summary = "test") {
  return Object.fromEntries(CATEGORIES.map((c) => [c, { score, summary }])) as Record<
    InspectionCategory,
    { score: number; summary: string }
  >;
}

describe("deriveGrade", () => {
  it.each([
    [100, "S"],
    [95, "S"],
    [85, "A"],
    [70, "B"],
    [55, "C"],
    [40, "D"],
    [39, "F"],
    [0, "F"],
  ])("score %i → grade %s", (score, expected) => {
    expect(deriveGrade(score, thresholds)).toBe(expected);
  });
});

describe("calculateScoreCard", () => {
  it("returns overall as weighted average of dimensions", () => {
    const breakdown = makeBreakdown(80);
    const card = calculateScoreCard(breakdown, weights, thresholds);
    // All dims are 80, so overall should also be 80
    expect(card.overall).toBe(80);
  });

  it("clamps dimension scores to [0, 100]", () => {
    const breakdown = makeBreakdown(120); // out of range
    const card = calculateScoreCard(breakdown, weights, thresholds);
    for (const cat of CATEGORIES) {
      expect(card.breakdown[cat].score).toBeLessThanOrEqual(100);
    }
  });

  it("assigns grade based on overall score", () => {
    expect(calculateScoreCard(makeBreakdown(96), weights, thresholds).grade).toBe("S");
    expect(calculateScoreCard(makeBreakdown(86), weights, thresholds).grade).toBe("A");
    expect(calculateScoreCard(makeBreakdown(38), weights, thresholds).grade).toBe("F");
  });

  it("stores weight from config in each dimension", () => {
    const card = calculateScoreCard(makeBreakdown(50), weights, thresholds);
    expect(card.breakdown.security.weight).toBe(0.25);
    expect(card.breakdown.correctness.weight).toBe(0.10);
  });
});

describe("aggregateScoreCards", () => {
  it("returns perfect score for empty array", () => {
    const card = aggregateScoreCards([], weights, thresholds);
    expect(card.overall).toBe(100);
    expect(card.grade).toBe("S");
  });

  it("averages scores across files", () => {
    const card80 = calculateScoreCard(makeBreakdown(80), weights, thresholds);
    const card60 = calculateScoreCard(makeBreakdown(60), weights, thresholds);
    const agg = aggregateScoreCards([card80, card60], weights, thresholds);
    expect(agg.overall).toBe(70);
  });

  it("uses worst-file summary for each dimension", () => {
    const goodBreakdown = makeBreakdown(90, "良好なデザイン");
    const badBreakdown = { ...makeBreakdown(90, "良好なデザイン"), design: { score: 30, summary: "SRP違反" } };
    const goodCard = calculateScoreCard(goodBreakdown, weights, thresholds);
    const badCard = calculateScoreCard(badBreakdown, weights, thresholds);
    const agg = aggregateScoreCards([goodCard, badCard], weights, thresholds);
    expect(agg.breakdown.design.summary).toBe("SRP違反");
  });

  it("handles a single file correctly", () => {
    const card = calculateScoreCard(makeBreakdown(75), weights, thresholds);
    const agg = aggregateScoreCards([card], weights, thresholds);
    expect(agg.overall).toBe(75);
  });
});
