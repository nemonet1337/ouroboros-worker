import { describe, it, expect } from "vitest";
import { UsageAccumulator } from "../analytics/usage.accumulator";
import { mergeHealingSummary, parseHealingSummary, usageTotals } from "../healing/summary";
import { canStartFix } from "../healing/fix";

describe("UsageAccumulator", () => {
  it("sums prompt and completion tokens across complete and embed-like events", () => {
    const acc = new UsageAccumulator();
    acc.record({ model: "@cf/embed", promptTokens: 100, completionTokens: 0 });
    acc.record({ model: "@cf/gen", promptTokens: 20, completionTokens: 50 });
    expect(acc.snapshot()).toEqual({
      model: "@cf/gen",
      promptTokens: 120,
      completionTokens: 50,
    });
  });
});

describe("healing summary merge", () => {
  it("deep-merges index so usage is not wiped by later file counts", () => {
    const first = mergeHealingSummary(null, {
      index: { files: 0, chunks: 0, usage: { model: "emb", promptTokens: 10, completionTokens: 0 } },
    });
    const second = mergeHealingSummary(first, { index: { files: 3, chunks: 12 } });
    const parsed = parseHealingSummary(second);
    expect(parsed.index?.files).toBe(3);
    expect(parsed.index?.chunks).toBe(12);
    expect(parsed.index?.usage).toEqual({ model: "emb", promptTokens: 10, completionTokens: 0 });
  });

  it("sums index + analyze usage", () => {
    const totals = usageTotals({
      index: { files: 1, chunks: 1, usage: { model: "emb", promptTokens: 8, completionTokens: 0 } },
      analysis: {
        overall: 80,
        grade: "A",
        breakdown: {},
        findingCount: 1,
        autoFixableCount: 1,
        summary: "ok",
        usage: { model: "gen", promptTokens: 2, completionTokens: 9 },
      },
    });
    expect(totals.analyze).toEqual({ model: "gen", promptTokens: 10, completionTokens: 9 });
  });
});

describe("canStartFix", () => {
  it("allows fix only when analyzed", () => {
    expect(canStartFix("analyzed", [])).toBe(true);
    expect(canStartFix("done", [])).toBe(false);
    expect(canStartFix("analyzed", undefined)).toBe(false);
  });
});
