import { describe, it, expect } from "vitest";
import { userModelsSchema } from "../http/validation";
import { NoopRunner } from "./helpers";

describe("userModelsSchema", () => {
  it("accepts text and embedding model ids and empty string (reset)", () => {
    const result = userModelsSchema({
      model: "anthropic/claude-sonnet-4-6",
      embeddingModel: "openai/text-embedding-3-small",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        model: "anthropic/claude-sonnet-4-6",
        embeddingModel: "openai/text-embedding-3-small",
      });
    }
  });

  it("accepts empty string to reset", () => {
    const result = userModelsSchema({ model: "", embeddingModel: "" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ model: "", embeddingModel: "" });
    }
  });

  it("rejects non-provider model ids", () => {
    const result = userModelsSchema({ model: "gpt-4o" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("gpt-4o");
    }
  });

  it("ignores unknown fields", () => {
    const result = userModelsSchema({ bogus: "x/y", model: "anthropic/claude-sonnet-4-6" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ model: "anthropic/claude-sonnet-4-6" });
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
