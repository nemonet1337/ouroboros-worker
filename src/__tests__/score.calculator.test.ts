import { describe, it, expect } from "vitest";
import {
  deriveGrade,
  calculateScoreCard,
  aggregateScoreCards,
} from "../inspection/score.calculator";
import {
  DEFAULT_ASPECT_WEIGHTS,
  DEFAULT_GRADE_THRESHOLDS,
} from "../config/inspection.config";
import { ASPECTS } from "../inspection/aspects";
import { InspectionAspect } from "../types";

const thresholds = DEFAULT_GRADE_THRESHOLDS;
const weights = DEFAULT_ASPECT_WEIGHTS;

function makeBreakdown(score: number, summary = "test") {
  return Object.fromEntries(ASPECTS.map((a) => [a, { score, summary }])) as Record<
    InspectionAspect,
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
  it("returns overall as weighted average of all 32 aspects", () => {
    const breakdown = makeBreakdown(80);
    const card = calculateScoreCard(breakdown, weights, thresholds);
    // All aspects are 80, so overall should also be 80
    expect(card.overall).toBe(80);
  });

  it("exposes both the 6-category breakdown and the 32-aspect breakdown", () => {
    const card = calculateScoreCard(makeBreakdown(80), weights, thresholds);
    expect(Object.keys(card.breakdown)).toHaveLength(6);
    expect(Object.keys(card.aspectBreakdown)).toHaveLength(32);
  });

  it("clamps aspect scores to [0, 100]", () => {
    const card = calculateScoreCard(makeBreakdown(120), weights, thresholds);
    for (const a of ASPECTS) {
      expect(card.aspectBreakdown[a].score).toBeLessThanOrEqual(100);
    }
  });

  it("assigns grade based on overall score", () => {
    expect(calculateScoreCard(makeBreakdown(96), weights, thresholds).grade).toBe("S");
    expect(calculateScoreCard(makeBreakdown(86), weights, thresholds).grade).toBe("A");
    expect(calculateScoreCard(makeBreakdown(38), weights, thresholds).grade).toBe("F");
  });

  it("derives category weight as the sum of its child aspect weights", () => {
    const card = calculateScoreCard(makeBreakdown(50), weights, thresholds);
    expect(card.breakdown.security.weight).toBeCloseTo(0.25, 6);
    expect(card.breakdown.correctness.weight).toBeCloseTo(0.1, 6);
  });

  it("tags each aspect with its parent category", () => {
    const card = calculateScoreCard(makeBreakdown(50), weights, thresholds);
    expect(card.aspectBreakdown.injection.category).toBe("security");
    expect(card.aspectBreakdown.algo_complexity.category).toBe("performance");
    expect(card.aspectBreakdown.type_contract.category).toBe("correctness");
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

  it("uses worst-file summary for each aspect", () => {
    const goodBreakdown = makeBreakdown(90, "良好");
    const badBreakdown = {
      ...makeBreakdown(90, "良好"),
      srp_cohesion: { score: 30, summary: "SRP違反" },
    };
    const goodCard = calculateScoreCard(goodBreakdown, weights, thresholds);
    const badCard = calculateScoreCard(badBreakdown, weights, thresholds);
    const agg = aggregateScoreCards([goodCard, badCard], weights, thresholds);
    // srp_cohesion is the worst child of design → its summary surfaces at category level too
    expect(agg.aspectBreakdown.srp_cohesion.summary).toBe("SRP違反");
    expect(agg.breakdown.design.summary).toBe("SRP違反");
  });

  it("handles a single file correctly", () => {
    const card = calculateScoreCard(makeBreakdown(75), weights, thresholds);
    const agg = aggregateScoreCards([card], weights, thresholds);
    expect(agg.overall).toBe(75);
  });
});
