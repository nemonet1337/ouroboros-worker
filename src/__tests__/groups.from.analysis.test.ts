import { describe, it, expect } from "vitest";
import { groupsFromAnalysis } from "../healing/groups.from.analysis";
import type { AllFindings, InspectionFinding, InspectionResult } from "../types";

function emptyScan(): AllFindings {
  return {
    staticAnalysis: [],
    dependency: [],
    performance: [],
    secrets: [],
    licenses: [],
    detectedFrameworks: [],
    timestamp: new Date(),
    commitHash: "sha",
  };
}

function finding(overrides: Partial<InspectionFinding> & Pick<InspectionFinding, "id" | "title">): InspectionFinding {
  return {
    category: "security",
    severity: "high",
    description: "desc",
    location: { file: "src/a.ts", startLine: 1, endLine: 2, snippet: "x" },
    impact: "i",
    scorePenalty: 5,
    hasRecommendation: false,
    ...overrides,
  };
}

function inspection(findings: InspectionFinding[]): InspectionResult {
  return {
    id: "insp",
    requestId: "req",
    completedAt: "",
    durationMs: 0,
    language: "typescript",
    scoreCard: {
      overall: 70,
      grade: "B",
      breakdown: {} as InspectionResult["scoreCard"]["breakdown"],
      aspectBreakdown: {} as InspectionResult["scoreCard"]["aspectBreakdown"],
    },
    findings,
    recommendations: [],
    files: [],
    refactorCandidates: [],
    summary: "sum",
    aiModel: "m",
    contentHash: "",
  };
}

describe("groupsFromAnalysis", () => {
  it("bundles inspection findings on the same file into one group", () => {
    const groups = groupsFromAnalysis(
      inspection([
        finding({ id: "1", title: "xss", location: { file: "src/a.ts", startLine: 1, endLine: 2, snippet: "" } }),
        finding({ id: "2", title: "eval", location: { file: "src/a.ts", startLine: 4, endLine: 5, snippet: "" } }),
      ]),
      emptyScan()
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].findings).toHaveLength(2);
    expect(groups[0].priority).toBe("high");
  });

  it("marks a group autoFixable when a finding has a recommendation", () => {
    const groups = groupsFromAnalysis(
      inspection([finding({ id: "1", title: "fixme", hasRecommendation: true })]),
      emptyScan()
    );
    expect(groups[0].autoFixable).toBe(true);
  });

  it("never auto-fixes secret findings", () => {
    const groups = groupsFromAnalysis(null, {
      ...emptyScan(),
      secrets: [
        {
          type: "secret",
          tool: "gitleaks",
          detector: "github-token",
          file: ".env",
          line: 1,
          description: "token",
        },
      ],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].autoFixable).toBe(false);
    expect(groups[0].priority).toBe("critical");
  });

  it("caps the number of groups", () => {
    const findings = Array.from({ length: 20 }, (_, i) =>
      finding({
        id: String(i),
        title: `f${i}`,
        location: { file: `src/${i}.ts`, startLine: 1, endLine: 1, snippet: "" },
      })
    );
    expect(groupsFromAnalysis(inspection(findings), emptyScan(), 5)).toHaveLength(5);
  });
});
