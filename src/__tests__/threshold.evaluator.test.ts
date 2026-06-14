import { describe, it, expect } from "vitest";
import { evaluateThresholds } from "../webhook/threshold.evaluator";
import { AspectBreakdown, InspectionCategory, InspectionResult } from "../types";
import { ASPECTS, ASPECT_CATEGORY } from "../inspection/aspects";
import { DEFAULT_ASPECT_WEIGHTS } from "../config/inspection.config";

function makeResult(scores: Partial<Record<"overall" | "security" | "performance" | "redundancy" | "readability" | "design" | "correctness", number>> = {}): InspectionResult {
  const s = {
    overall: 75, security: 80, performance: 70,
    redundancy: 80, readability: 80, design: 80, correctness: 90,
    ...scores,
  };
  const catScore = (c: InspectionCategory) => s[c];
  const aspectBreakdown = Object.fromEntries(
    ASPECTS.map((a) => {
      const cat = ASPECT_CATEGORY[a];
      return [a, { score: catScore(cat), weight: DEFAULT_ASPECT_WEIGHTS[a], summary: "ok", category: cat }];
    })
  ) as AspectBreakdown;
  return {
    id: "test-id",
    requestId: "req-id",
    completedAt: new Date().toISOString(),
    durationMs: 1000,
    language: "typescript",
    scoreCard: {
      overall: s.overall,
      grade: "B",
      breakdown: {
        security:    { score: s.security,    weight: 0.25, summary: "ok" },
        performance: { score: s.performance, weight: 0.20, summary: "ok" },
        redundancy:  { score: s.redundancy,  weight: 0.15, summary: "ok" },
        readability: { score: s.readability, weight: 0.15, summary: "ok" },
        design:      { score: s.design,      weight: 0.15, summary: "ok" },
        correctness: { score: s.correctness, weight: 0.10, summary: "ok" },
      },
      aspectBreakdown,
    },
    findings: [],
    recommendations: [],
    files: [],
    refactorCandidates: [],
    summary: "test summary",
    aiModel: "claude-sonnet-4-6",
    contentHash: "sha256:abc",
  };
}

describe("evaluateThresholds", () => {
  it("returns no breaches when all scores meet thresholds", () => {
    const result = makeResult({ overall: 80, design: 85, performance: 75 });
    expect(evaluateThresholds(result, { overall: 70, design: 70, performance: 70 })).toHaveLength(0);
  });

  it("returns no breaches when thresholds are empty", () => {
    const result = makeResult({ overall: 30 });
    expect(evaluateThresholds(result, {})).toHaveLength(0);
  });

  it("detects overall breach with correct values", () => {
    const result = makeResult({ overall: 60 });
    const [breach] = evaluateThresholds(result, { overall: 70 });
    expect(breach.category).toBe("overall");
    expect(breach.threshold).toBe(70);
    expect(breach.actual).toBe(60);
  });

  it("detects a single category breach", () => {
    const result = makeResult({ design: 50 });
    const breaches = evaluateThresholds(result, { design: 60 });
    expect(breaches).toHaveLength(1);
    expect(breaches[0].category).toBe("design");
  });

  it("detects multiple category breaches simultaneously", () => {
    const result = makeResult({ design: 40, performance: 35 });
    const breaches = evaluateThresholds(result, { design: 60, performance: 60 });
    expect(breaches).toHaveLength(2);
    const cats = breaches.map((b) => b.category);
    expect(cats).toContain("design");
    expect(cats).toContain("performance");
  });

  it("does not breach when actual equals threshold exactly", () => {
    const result = makeResult({ overall: 70 });
    expect(evaluateThresholds(result, { overall: 70 })).toHaveLength(0);
  });

  it("does not report categories absent from thresholds config", () => {
    const result = makeResult({ design: 10 }); // very low design, but no design threshold
    const breaches = evaluateThresholds(result, { performance: 80 });
    const cats = breaches.map((b) => b.category);
    expect(cats).not.toContain("design");
  });

  it("can detect breaches across all six categories at once", () => {
    const result = makeResult({ security: 40, performance: 40, redundancy: 40, readability: 40, design: 40, correctness: 40 });
    const breaches = evaluateThresholds(result, {
      security: 60, performance: 60, redundancy: 60, readability: 60, design: 60, correctness: 60,
    });
    expect(breaches).toHaveLength(6);
  });

  it("detects overall + category breach together", () => {
    const result = makeResult({ overall: 55, performance: 45 });
    const breaches = evaluateThresholds(result, { overall: 70, performance: 60 });
    expect(breaches).toHaveLength(2);
    expect(breaches.map((b) => b.category)).toContain("overall");
    expect(breaches.map((b) => b.category)).toContain("performance");
  });
});
