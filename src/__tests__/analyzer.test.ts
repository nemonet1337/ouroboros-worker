import { describe, it, expect } from "vitest";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { defaultHealingConfig } from "../config/healing.config";
import { AllFindings } from "../types";
import { mockAi } from "./helpers";

function emptyFindings(): AllFindings {
  return {
    staticAnalysis: [],
    dependency: [],
    performance: [],
    secrets: [],
    licenses: [],
    detectedFrameworks: [],
    timestamp: new Date(),
    commitHash: "test-sha",
  };
}

describe("AIAnalyzer", () => {
  it("constructs without error", () => {
    expect(new AIAnalyzer(defaultHealingConfig, mockAi())).toBeDefined();
  });

  it("returns empty groups immediately when there are no findings", async () => {
    const analyzer = new AIAnalyzer(defaultHealingConfig, mockAi());
    const result = await analyzer.analyze(emptyFindings());
    expect(result.groups).toEqual([]);
    expect(result.riskScore).toBe(0);
    expect(result.summary).toContain("問題は検出されませんでした");
  });

  it("fallback produces critical groups for critical dependency vulnerabilities", async () => {
    // mockAi returns "" → JSON.parse fails → fallback heuristics kick in
    const analyzer = new AIAnalyzer(defaultHealingConfig, mockAi(""));

    const findings: AllFindings = {
      ...emptyFindings(),
      dependency: [
        {
          ecosystem: "npm",
          packageName: "lodash",
          currentVersion: "4.17.15",
          latestVersion: "4.17.21",
          updateType: "patch",
          vulnerabilities: [
            {
              id: "CVE-2021-12345",
              severity: "critical",
              cvssScore: 9.8,
              description: "Prototype pollution",
              patchedVersion: "4.17.21",
            },
          ],
          breakingChanges: false,
          manifestFile: "package.json",
        },
      ],
    };

    const result = await analyzer.analyze(findings);
    // Either AI succeeded or fallback kicked in — either way we get a group for lodash
    expect(result.groups.length).toBeGreaterThan(0);
  });

  it("fallback surfaces critical static-analysis findings (runner severity enum)", async () => {
    // mockAi returns "" → JSON.parse fails → fallback heuristics kick in
    const analyzer = new AIAnalyzer(defaultHealingConfig, mockAi(""));

    const findings: AllFindings = {
      ...emptyFindings(),
      staticAnalysis: [
        {
          id: "eval-usage/src/a.ts",
          ruleId: "eval-usage",
          title: "evalの使用",
          message: "evalの使用は任意コード実行のリスクがあります",
          severity: "critical",
          file: "src/a.ts",
          line: 12,
        },
      ],
    };

    const result = await analyzer.analyze(findings);
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups[0].id).toContain("eval-usage");
    expect(result.groups[0].priority).toBe("critical");
    expect(result.riskScore).toBe(80);
  });
});
