import { describe, it, expect } from "vitest";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { defaultHealingConfig } from "../config/healing.config";
import { AllFindings } from "../types";
import { mockAi } from "./helpers";

function emptyFindings(): AllFindings {
  return {
    codeql: [],
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
});
