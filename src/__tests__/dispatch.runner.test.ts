import { describe, it, expect } from "vitest";
import { NoopRunner } from "../ports/runner";

describe("NoopRunner (replaces DispatchRunner)", () => {
  it("applyFix fails explicitly", async () => {
    const runner = new NoopRunner();
    const result = await runner.applyFix({
      group: {
        id: "g",
        priority: "high",
        findings: [],
        autoFixable: true,
        estimatedRisk: "",
        fixStrategy: { title: "", steps: [], rationale: "" },
      },
      baseBranch: "main",
      branchPrefix: "fix/",
      dryRun: false,
    });
    expect(result.success).toBe(false);
  });
});
