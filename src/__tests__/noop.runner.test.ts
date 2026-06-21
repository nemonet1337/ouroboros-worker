import { describe, it, expect } from "vitest";
import { NoopRunner } from "../ports/runner";

describe("NoopRunner", () => {
  it("should return empty scan results", async () => {
    const runner = new NoopRunner();
    const result = await runner.scan();
    expect(result.findings.codeql).toEqual([]);
  });

  it("should return unsuccessful fix result", async () => {
    const runner = new NoopRunner();
    const result = await runner.applyFix({
      group: {
        id: "1",
        priority: "high",
        findings: [],
        autoFixable: true,
        estimatedRisk: "low",
        fixStrategy: { title: "Fix", steps: [], rationale: "" },
      },
      baseBranch: "main",
      branchPrefix: "fix/",
      dryRun: false,
    });
    expect(result.success).toBe(false);
    expect(result.validationOutput).toBe("no runner configured");
  });
});
