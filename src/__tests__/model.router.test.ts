import { describe, it, expect, vi } from "vitest";
import {
  buildDecisionState,
  decideRoute,
  parseDifficulty,
  parseTier,
  resolveDecision,
} from "../ai/router";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "../config/routing";
import type { AiProvider, LocalDecisionConfig } from "../ai/types";
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

describe("buildDecisionState", () => {
  it("omits the saturated snippet count", () => {
    const state = buildDecisionState("認証処理を直して", {
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
    const state = buildDecisionState("x", { repoFileCount: 3, snippets: [] });
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
    expect(route.decisionAvailable).toBe(true);
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
    expect(route.decisionAvailable).toBe(false);
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
    expect(route.decisionAvailable).toBe(false);
  });

  it("falls back to Efficiency when the score is unusable", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: {}, tier: { choice: "performance" } }),
      instruction: "x",
      summary,
      config,
    });
    expect(route.model).toBe("openai/gpt-6-luna");
    expect(route.decisionAvailable).toBe(true);
    expect(route.tier).toBe("performance");
  });
});

const LOCAL: LocalDecisionConfig = {
  url: "http://127.0.0.1:8000",
  model: "typed-decisions",
  fileSelection: true,
};

const LOCAL_CONFIG: RoutingConfig = {
  ...DEFAULT_ROUTING_CONFIG,
  decisionBackend: "local",
};

function aiWithDecide(impl: (req: unknown, local?: LocalDecisionConfig) => Promise<unknown>): AiProvider {
  return {
    name: "mock",
    complete: vi.fn(),
    decide: vi.fn(impl),
  } as unknown as AiProvider;
}

describe("resolveDecision backend order", () => {
  const state = "task";

  it("tries the local backend first when decisionBackend is local", async () => {
    const seen: (LocalDecisionConfig | undefined)[] = [];
    const ai = aiWithDecide(async (_req, local) => {
      seen.push(local);
      return { answers: { difficulty: { score: 2 } } };
    });

    const res = await resolveDecision({ ai, state, config: LOCAL_CONFIG });

    expect(res.backend).toBe("local");
    expect(res.available).toBe(true);
    expect(seen[0]).toMatchObject({ url: LOCAL.url, model: LOCAL.model });
    expect(res.answers).toEqual({ difficulty: { score: 2 } });
  });

  it("falls back to remote with routerModel when the local backend throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const seen: (LocalDecisionConfig | undefined)[] = [];
    const models: (string | undefined)[] = [];
    const ai = aiWithDecide(async (req, local) => {
      seen.push(local);
      models.push((req as { model?: string }).model);
      if (local) throw new Error("laya unreachable");
      return { answers: { difficulty: { score: 4 } } };
    });

    const res = await resolveDecision({ ai, state, config: LOCAL_CONFIG });

    expect(warn).toHaveBeenCalled();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject(LOCAL);
    expect(seen[1]).toBeUndefined();
    expect(models[1]).toBe(DEFAULT_ROUTING_CONFIG.routerModel);
    expect(res.backend).toBe("remote");
    expect(res.available).toBe(true);
    expect(res.answers).toEqual({ difficulty: { score: 4 } });
    warn.mockRestore();
  });

  it("never calls the local backend when decisionBackend is remote", async () => {
    const seen: (LocalDecisionConfig | undefined)[] = [];
    const ai = aiWithDecide(async (_req, local) => {
      seen.push(local);
      return { answers: {} };
    });

    await resolveDecision({ ai, state, config: DEFAULT_ROUTING_CONFIG });

    expect(seen).toEqual([undefined]);
  });

  it("returns unavailable when the decision model cannot serve decisions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = aiWithDecide(async (_req, local) => {
      if (local) throw new Error("laya down");
      return { answers: {} };
    });
    const res = await resolveDecision({
      ai,
      state,
      config: { ...LOCAL_CONFIG, routerModel: "anthropic/claude-sonnet-4-6" },
    });

    expect(warn).toHaveBeenCalled();
    expect(res.available).toBe(false);
    expect(res.answers).toBeNull();
    warn.mockRestore();
  });

  it("returns unavailable when both backends fail", async () => {
    const ai = aiWithDecide(async () => {
      throw new Error("all down");
    });
    const res = await resolveDecision({ ai, state, config: LOCAL_CONFIG });

    expect(res.available).toBe(false);
    expect(res.answers).toBeNull();
  });
});

describe("decideRoute with a local backend", () => {
  const summary = { repoFileCount: 2, snippets: [snippet("src/a.ts", 0.9)] };

  it("uses the local score and reports the local backend", async () => {
    const route = await decideRoute({
      ai: aiWith({ difficulty: { score: 5 }, tier: { choice: "performance" } }),
      instruction: "x",
      summary,
      config: LOCAL_CONFIG,
    });
    expect(route.difficulty).toBe(5);
    expect(route.backend).toBe("local");
    expect(route.model).toBe("openai/gpt-6-sol");
  });

  it("uses the remote score after a local failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = aiWithDecide(async (_req, local) => {
      if (local) throw new Error("laya down");
      return { answers: { difficulty: { score: 2 } } };
    });

    const route = await decideRoute({ ai, instruction: "x", summary, config: LOCAL_CONFIG });

    expect(route.backend).toBe("remote");
    expect(route.difficulty).toBe(2);
    expect(route.model).toBe("openai/gpt-6-luna");
    warn.mockRestore();
  });

  it("drops to Efficiency when every backend fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ai = aiWithDecide(async () => {
      throw new Error("down");
    });

    const route = await decideRoute({ ai, instruction: "x", summary, config: LOCAL_CONFIG });

    expect(route.decisionAvailable).toBe(false);
    expect(route.difficulty).toBeNull();
    expect(route.model).toBe("openai/gpt-6-luna");
    warn.mockRestore();
  });
});
