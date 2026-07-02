import { describe, it, expect } from "vitest";
import { modeModelsSchema } from "../http/validation";
import { UnconfiguredRunner } from "../ports/runner";
import { normalizeAllFindings } from "../utils/findings.normalize";

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

describe("UnconfiguredRunner", () => {
  it("throws an explicit error from scan instead of returning empty findings", async () => {
    const runner = new UnconfiguredRunner();
    await expect(runner.scan()).rejects.toThrow("no runner configured");
  });

  it("returns explicit failure from applyFix", async () => {
    const runner = new UnconfiguredRunner();
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

describe("normalizeAllFindings", () => {
  it("passes through new-format staticAnalysis findings", () => {
    const findings = normalizeAllFindings({
      staticAnalysis: [
        { id: "eval-usage/a.ts", ruleId: "eval-usage", title: "t", message: "m", severity: "critical", file: "a.ts", line: 5 },
      ],
    });
    expect(findings.staticAnalysis[0]).toMatchObject({ ruleId: "eval-usage", severity: "critical", line: 5 });
  });

  it("maps legacy severities error/warning/note to high/medium/info", () => {
    const findings = normalizeAllFindings({
      codeql: [
        { ruleId: "a", severity: "error", message: "", location: { file: "f", startLine: 1 } },
        { ruleId: "b", severity: "warning", message: "", location: { file: "f", startLine: 2 } },
        { ruleId: "c", severity: "note", message: "", location: { file: "f", startLine: 3 } },
      ],
    });
    expect(findings.staticAnalysis.map((f) => f.severity)).toEqual(["high", "medium", "info"]);
  });

  it("tolerates missing keys", () => {
    const findings = normalizeAllFindings({});
    expect(findings.staticAnalysis).toEqual([]);
    expect(findings.dependency).toEqual([]);
    expect(findings.commitHash).toBe("");
  });
});
