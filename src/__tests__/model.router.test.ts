import { describe, it, expect, vi } from "vitest";
import {
  buildClefState,
  decideRoute,
  parseDifficulty,
  parseTier,
} from "../routing/model.router";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "../config/routing";
import type { AiProvider } from "../ports";
import type { CodeSnippet } from "../retrieval/chunk.rank";

const snippet = (file: string, score: number, kind: CodeSnippet["kind"] = "fn"): CodeSnippet => ({
  file,
  startLine: 1,
  endLine: 40,
  text: "x",
  score,
  lang: "typescript",
  kind,
  symbol: "foo",
});

function aiWith(answers: Record<string, unknown> | null): AiProvider {
  return {
    name: "mock",
    complete: vi.fn(),
    decide: answers === null ? undefined : vi.fn().mockResolvedValue({ answers }),
  } as unknown as AiProvider;
}

const config: RoutingConfig = { ...DEFAULT_ROUTING_CONFIG };

describe("parseDifficulty", () => {
  it("reads a plain number", () => {
    expect(parseDifficulty({ score: 4 })).toBe(4);
  });

  it("reads a nested score object", () => {
    expect(parseDifficulty({ score: { score: 3, probabilities: { "3": 0.7 } } })).toBe(3);
  });

  it("reads a numeric string", () => {
    expect(parseDifficulty({ score: "5" })).toBe(5);
  });

  it("falls back to the highest probability label", () => {
    expect(parseDifficulty({ probabilities: { "1": 0.1, "5": 0.8, "3": 0.1 } })).toBe(5);
  });

  it("returns null when nothing is usable", () => {
    expect(parseDifficulty(null)).toBeNull();
    expect(parseDifficulty({})).toBeNull();
    expect(parseDifficulty({ probabilities: {} })).toBeNull();
  });
});

describe("parseTier", () => {
  it("reads an explicit choice", () => {
    expect(parseTier({ choice: "performance" })).toBe("performance");
    expect(parseTier({ choice: "efficiency" })).toBe("efficiency");
  });

  it("falls back to the highest probability", () => {
    expect(parseTier({ probabilities: { efficiency: 0.2, performance: 0.8 } })).toBe("performance");
  });

  it("returns unknown for anything else", () => {
    expect(parseTier(null)).toBe("unknown");
    expect(parseTier({ choice: "middle" })).toBe("unknown");
  });
});

describe("buildClefState", () => {
  it("omits the saturated snippet count", () => {
    const state = buildClefState("認証処理を直して", {
      repoFileCount: 10,
      snippets: Array.from({ length: 20 }, (_, i) => snippet(`src/f${i}.ts`, 0.8)),
    });
    expect(state).not.toContain("検索 20");
    expect(state).not.toMatch(/件 found/);
    // 代わりに score 分布と kind 内訳を渡す
    expect(state).toContain("固有ファイル数: 20");
    expect(state).toContain("kind 内訳");
    expect(state).toContain("symbol=foo");
  });

  it("handles an empty result set", () => {
    const state = buildClefState("x", { repoFileCount: 3, snippets: [] });
    expect(state).toContain("該当コードなし");
  });
});

describe("decideRoute", () => {
  const summary = { repoFileCount: 2, snippets: [snippet("src/a.ts", 0.9)] };

  it("uses Performance at or above the threshold", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: { score: 4 }, tier: { choice: "performance" } }),
      instruction: "x",
      summary,
      config,
    });
    expect(route.model).toBe("openai/gpt-6-sol");
    expect(route.reasoningEffort).toBe("medium");
    expect(route.difficulty).toBe(4);
    expect(route.clefAvailable).toBe(true);
  });

  it("uses Efficiency below the threshold", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: { score: 2 }, tier: { choice: "efficiency" } }),
      instruction: "x",
      summary,
      config,
    });
    expect(route.model).toBe("openai/gpt-6-luna");
    expect(route.reasoningEffort).toBe("low");
  });

  it("honours a custom threshold", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: { score: 3 } }),
      instruction: "x",
      summary,
      config: { ...config, solThreshold: 3 },
    });
    expect(route.model).toBe("openai/gpt-6-sol");
  });

  it("falls back to Efficiency when the provider has no decision model", async () => {
    const route = await decideRoute({
      ai: aiWith(null),
      instruction: "x",
      summary,
      config,
    });
    expect(route.model).toBe("openai/gpt-6-luna");
    expect(route.clefAvailable).toBe(false);
    expect(route.difficulty).toBeNull();
  });

  it("falls back to Efficiency when the decision call throws", async () => {
    const ai = {
      name: "mock",
      complete: vi.fn(),
      decide: vi.fn().mockRejectedValue(new Error("clef down")),
    } as unknown as AiProvider;
    const route = await decideRoute({ ai, instruction: "x", summary, config });
    expect(route.model).toBe("openai/gpt-6-luna");
    expect(route.clefAvailable).toBe(false);
  });

  it("falls back to Efficiency when the score is unusable", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: {}, tier: { choice: "performance" } }),
      instruction: "x",
      summary,
      config,
    });
    expect(route.model).toBe("openai/gpt-6-luna");
    expect(route.clefAvailable).toBe(true);
    expect(route.tier).toBe("performance");
  });
});
