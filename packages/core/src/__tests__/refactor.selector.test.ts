import { describe, it, expect } from "vitest";
import { selectRefactorCandidates } from "../inspection/refactor.selector";
import { DEFAULT_WEIGHTS, defaultInspectionConfig } from "../config/inspection.config";
import {
  FileResult,
  FunctionResult,
  InspectionCategory,
  InspectionFinding,
  ScoreCard,
} from "../types/inspection.types";
import { CATEGORIES } from "../inspection/score.calculator";

const cfg = {
  overallThreshold: defaultInspectionConfig.refactor.overallThreshold,
  dimensionThreshold: defaultInspectionConfig.refactor.dimensionThreshold,
  weights: DEFAULT_WEIGHTS,
};

function makeScoreCard(scores: Partial<Record<InspectionCategory, number>> = {}, base = 90): ScoreCard {
  const breakdown = Object.fromEntries(
    CATEGORIES.map((c) => [c, { score: scores[c] ?? base, weight: DEFAULT_WEIGHTS[c], summary: "ok" }])
  ) as ScoreCard["breakdown"];
  const overall = Math.round(
    CATEGORIES.reduce((sum, c) => sum + breakdown[c].score * DEFAULT_WEIGHTS[c], 0)
  );
  return { overall, grade: overall >= 85 ? "A" : overall >= 70 ? "B" : "C", breakdown };
}

function makeFinding(severity: InspectionFinding["severity"], file = "a.ts"): InspectionFinding {
  return {
    id: `f-${severity}-${Math.random().toString(36).slice(2, 8)}`,
    category: "security",
    severity,
    title: "t",
    description: "d",
    location: { file, startLine: 1, endLine: 5, snippet: "" },
    impact: "i",
    scorePenalty: 5,
    hasRecommendation: false,
  };
}

function makeFunction(name: string, scores: Partial<Record<InspectionCategory, number>>, findings: InspectionFinding[] = []): FunctionResult {
  return {
    name,
    location: { file: "a.ts", startLine: 1, endLine: 20, snippet: "" },
    scoreCard: makeScoreCard(scores),
    findings,
    recommendations: [],
  };
}

function makeFile(path: string, scores: Partial<Record<InspectionCategory, number>>, functions?: FunctionResult[], findings: InspectionFinding[] = []): FileResult {
  return { path, scoreCard: makeScoreCard(scores), findings, recommendations: [], functions };
}

describe("selectRefactorCandidates", () => {
  it("returns no candidates when all scores are healthy", () => {
    const out = selectRefactorCandidates({ files: [makeFile("good.ts", {})] }, cfg);
    expect(out).toHaveLength(0);
  });

  it("selects a file whose overall score is below the threshold", () => {
    const out = selectRefactorCandidates({ files: [makeFile("bad.ts", {}, undefined, [])] }, {
      ...cfg,
      overallThreshold: 95,
    });
    expect(out).toHaveLength(1);
    expect(out[0].unit).toBe("file");
    expect(out[0].name).toBe("bad.ts");
  });

  it("selects a unit when any single dimension falls below the threshold", () => {
    const out = selectRefactorCandidates(
      { files: [makeFile("sec.ts", { security: 30 })] },
      cfg
    );
    expect(out).toHaveLength(1);
    expect(out[0].weakestDimensions).toContain("security");
  });

  it("evaluates per-function when functions are present", () => {
    const file = makeFile("multi.ts", {}, [
      makeFunction("UserService.login", { security: 20 }),
      makeFunction("UserService.list", {}),
    ]);
    const out = selectRefactorCandidates({ files: [file] }, cfg);
    expect(out).toHaveLength(1);
    expect(out[0].unit).toBe("function");
    expect(out[0].name).toBe("UserService.login");
  });

  it("sorts candidates by priorityScore descending", () => {
    const file = makeFile("multi.ts", {}, [
      makeFunction("mild", { readability: 55 }),
      makeFunction("severe", { security: 10, performance: 20 }, [makeFinding("critical")]),
    ]);
    const out = selectRefactorCandidates({ files: [file] }, cfg);
    expect(out.map((c) => c.name)).toEqual(["severe", "mild"]);
    expect(out[0].priorityScore).toBeGreaterThan(out[1].priorityScore);
  });

  it("escalates priority with finding severity", () => {
    const calm = selectRefactorCandidates(
      { files: [makeFile("a.ts", { readability: 58 })] },
      cfg
    )[0];
    const urgent = selectRefactorCandidates(
      {
        files: [
          makeFile("b.ts", { readability: 58 }, undefined, [
            makeFinding("critical"),
            makeFinding("critical"),
          ]),
        ],
      },
      cfg
    )[0];
    expect(urgent.priorityScore).toBeGreaterThan(calm.priorityScore);
    expect(urgent.priority).toBe("critical");
    expect(calm.priority).toBe("low");
  });

  it("orders weakestDimensions worst-first", () => {
    const out = selectRefactorCandidates(
      { files: [makeFile("a.ts", { security: 50, performance: 10 })] },
      cfg
    );
    expect(out[0].weakestDimensions[0]).toBe("performance");
    expect(out[0].weakestDimensions).toContain("security");
  });

  it("includes a Japanese rationale referencing thresholds", () => {
    const out = selectRefactorCandidates(
      { files: [makeFile("a.ts", { security: 30 })] },
      cfg
    );
    expect(out[0].rationale).toContain("基準値");
    expect(out[0].rationale).toContain("security");
  });
});
