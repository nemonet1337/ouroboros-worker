import { describe, it, expect } from "vitest";
import { modeModelsSchema } from "../http/validation";
import { NoopRunner } from "../ports/runner";

describe("modeModelsSchema", () => {
  it("accepts valid per-mode model ids and empty string (reset)", () => {
    const result = modeModelsSchema({
      global: "minimax/m3",
      coding: "@cf/meta/llama-3.1-8b-instruct",
      plan: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        global: "minimax/m3",
        coding: "@cf/meta/llama-3.1-8b-instruct",
        plan: "",
      });
    }
  });

  it("rejects non-Workers-AI model ids", () => {
    const result = modeModelsSchema({ coding: "gpt-4o" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("gpt-4o");
    }
  });

  it("ignores unknown fields", () => {
    const result = modeModelsSchema({ bogus: "x/y", coding: "minimax/m3" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ coding: "minimax/m3" });
    }
  });
});

describe("NoopRunner", () => {
  it("returns empty findings from scan", async () => {
    const runner = new NoopRunner();
    const r = await runner.scan();
    expect(r.findings.staticAnalysis).toEqual([]);
  });

  it("returns explicit failure from applyFix", async () => {
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
    expect(result.validationOutput).toContain("no runner configured");
  });
});
