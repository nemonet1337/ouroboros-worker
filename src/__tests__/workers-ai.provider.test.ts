import { describe, it, expect, vi } from "vitest";
import {
  extractCompletionText,
  extractUsage,
  isPartnerModelId,
  mapCatalogModel,
  WorkersAiProvider,
} from "../adapters/workers-ai.provider";
import { DEFAULT_EMBEDDING_MODEL, EMBED_BATCH_LIMIT } from "../config/deployment";

describe("extractCompletionText", () => {
  it("reads OpenAI choices content", () => {
    expect(extractCompletionText({ choices: [{ message: { content: "hello" } }] })).toBe("hello");
  });

  it("reads legacy response field", () => {
    expect(extractCompletionText({ response: "old" })).toBe("old");
  });

  it("prefers choices over response", () => {
    expect(
      extractCompletionText({ response: "old", choices: [{ message: { content: "new" } }] })
    ).toBe("new");
  });

  it("returns empty for missing or non-object payloads", () => {
    expect(extractCompletionText({})).toBe("");
    expect(extractCompletionText(null)).toBe("");
    expect(extractCompletionText(undefined)).toBe("");
  });
});

describe("isPartnerModelId", () => {
  it("treats vendor/model ids as partner and catalog ids as binding", () => {
    expect(isPartnerModelId("openai/gpt-6-luna")).toBe(true);
    expect(isPartnerModelId("minimax/m3")).toBe(true);
    expect(isPartnerModelId("@cf/zai-org/glm-5.3-flash")).toBe(false);
  });
});

describe("extractUsage", () => {
  it("reads Chat Completions usage", () => {
    expect(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 3 } })).toMatchObject({
      promptTokens: 10,
      completionTokens: 3,
    });
  });

  it("reads Responses usage", () => {
    expect(
      extractUsage({ usage: { input_tokens: 20, output_tokens: 5 } })
    ).toMatchObject({ promptTokens: 20, completionTokens: 5 });
  });

  it("reads cache hits from prompt_tokens_details", () => {
    expect(
      extractUsage({
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 20 },
        },
      })
    ).toMatchObject({ cachedTokens: 80, cacheWriteTokens: 20 });
  });

  it("reads cache hits from input_tokens_details", () => {
    expect(
      extractUsage({
        usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 64 } },
      })
    ).toMatchObject({ cachedTokens: 64, cacheWriteTokens: 0 });
  });

  it("returns undefined without usage", () => {
    expect(extractUsage({})).toBeUndefined();
    expect(extractUsage(null)).toBeUndefined();
  });
});

describe("WorkersAiProvider.complete via binding", () => {
  it("extracts OpenAI-shaped binding results", async () => {
    const run = vi.fn().mockResolvedValue({ choices: [{ message: { content: "ok" } }] });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    expect(await provider.complete({ system: "s", prompt: "p" })).toBe("ok");
    expect(run).toHaveBeenCalled();
  });

  it("extracts legacy {response} binding results", async () => {
    const run = vi.fn().mockResolvedValue({ response: "legacy" });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    expect(await provider.complete({ system: "s", prompt: "p" })).toBe("legacy");
  });

  it("prefers the binding for partner models and falls back to REST only on failure", async () => {
    const run = vi.fn().mockResolvedValue({ choices: [{ message: { content: "bound" } }] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never, {
      apiToken: "tok",
      accountId: "acc",
    });
    expect(await provider.complete({ system: "s", prompt: "p", model: "openai/gpt-6-luna" })).toBe("bound");
    expect(run).toHaveBeenCalledWith("openai/gpt-6-luna", expect.anything());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("falls back to REST when the binding rejects a partner model", async () => {
    const run = vi.fn().mockRejectedValue(new Error("binding unavailable"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "rest" } }] }), { status: 200 })
    );
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never, {
      apiToken: "tok",
      accountId: "acc",
    });
    expect(await provider.complete({ system: "s", prompt: "p", model: "openai/gpt-6-sol" })).toBe("rest");
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sends reasoning_effort only to partner models", async () => {
    const run = vi.fn().mockResolvedValue({ response: "ok" });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await provider.complete({ system: "s", prompt: "p", model: "openai/gpt-6-luna", reasoningEffort: "low" });
    expect(run).toHaveBeenCalledWith(
      "openai/gpt-6-luna",
      expect.objectContaining({ reasoning_effort: "low" })
    );

    run.mockClear();
    await provider.complete({ system: "s", prompt: "p", model: "@cf/moonshotai/kimi-k2.6", reasoningEffort: "low" });
    expect(run.mock.calls[0][1]).not.toHaveProperty("reasoning_effort");
  });

  it("sends prompt_cache_key only to partner models", async () => {
    const run = vi.fn().mockResolvedValue({ response: "ok" });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await provider.complete({ system: "s", prompt: "p", model: "openai/gpt-6-luna", cacheKey: "k" });
    expect(run).toHaveBeenCalledWith(
      "openai/gpt-6-luna",
      expect.objectContaining({ prompt_cache_key: "k" })
    );

    run.mockClear();
    await provider.complete({ system: "s", prompt: "p", model: "@cf/moonshotai/kimi-k2.6", cacheKey: "k" });
    expect(run.mock.calls[0][1]).not.toHaveProperty("prompt_cache_key");
  });

  it("reports cache usage through onUsage", async () => {
    const onUsage = vi.fn();
    const run = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 90 } },
    });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never, { onUsage });
    await provider.complete({ system: "s", prompt: "p", model: "openai/gpt-6-luna" });
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/gpt-6-luna", cachedTokens: 90 })
    );
  });
});

describe("WorkersAiProvider.decide", () => {
  it("calls the Clef model with the typed questions", async () => {
    const run = vi.fn().mockResolvedValue({ answers: { difficulty: { score: 3 } } });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    const out = await provider.decide({
      state: "s",
      questions: { difficulty: { type: "score", instructions: "i", rubric: { "1": "a" } } },
    });
    expect(out.answers.difficulty).toEqual({ score: 3 });
    expect(run).toHaveBeenCalledWith(
      "@cf/cloudflare/clef-flash",
      expect.objectContaining({ model: "clef", state: "s" })
    );
  });

  it("throws when the model returns no answers", async () => {
    const run = vi.fn().mockResolvedValue({});
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await expect(provider.decide({ state: "s", questions: {} })).rejects.toThrow(/no answers/);
  });
});

describe("mapCatalogModel", () => {
  it("maps price, context window, and output dimensions", () => {
    const mapped = mapCatalogModel(
      {
        name: "@cf/openai/gpt-oss-120b",
        description: "reasoning",
        task: { name: "Text Generation" },
        properties: [
          { property_id: "context_window", value: "128000" },
          {
            property_id: "price",
            value: [
              { unit: "per M input tokens", price: 0.35, currency: "USD" },
              { unit: "per M output tokens", price: 0.75, currency: "USD" },
            ],
          },
        ],
      },
      "workers-ai"
    );
    expect(mapped).toMatchObject({
      value: "@cf/openai/gpt-oss-120b",
      task: "Text Generation",
      contextWindow: 128000,
    });
    expect(mapped?.pricing).toEqual([
      { unit: "per M input tokens", price: 0.35, currency: "USD" },
      { unit: "per M output tokens", price: 0.75, currency: "USD" },
    ]);
  });

  it("omits pricing when the catalog has none", () => {
    const mapped = mapCatalogModel(
      {
        name: "@cf/google/embeddinggemma-300m",
        task: { name: "Text Embeddings" },
        properties: [{ property_id: "beta", value: "true" }],
      },
      "workers-ai"
    );
    expect(mapped?.pricing).toBeUndefined();
    expect(mapped?.task).toBe("Text Embeddings");
  });

  it("returns null without a name", () => {
    expect(mapCatalogModel({ task: { name: "Text Generation" } }, "workers-ai")).toBeNull();
  });
});

describe("WorkersAiProvider.embed", () => {
  it("uses the given model id, defaulting to Qwen3 Embedding", async () => {
    const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await provider.embed(["hello"]);
    expect(run).toHaveBeenCalledWith(DEFAULT_EMBEDDING_MODEL, { text: ["hello"] });

    run.mockClear();
    await provider.embed(["hello"], "@cf/baai/bge-base-en-v1.5");
    expect(run).toHaveBeenCalledWith("@cf/baai/bge-base-en-v1.5", { text: ["hello"] });
  });

  it("splits batches at the model's maxItems limit", async () => {
    const run = vi.fn().mockImplementation(async (_id: string, payload: { text: string[] }) => ({
      data: payload.text.map(() => [0.1]),
    }));
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    const inputs = Array.from({ length: 33 }, (_, i) => `t${i}`);
    const out = await provider.embed(inputs);
    expect(out).toHaveLength(33);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0][1].text).toHaveLength(EMBED_BATCH_LIMIT);
    expect(run.mock.calls[1][1].text).toHaveLength(1);
  });

  it("throws when the response shape is wrong", async () => {
    const run = vi.fn().mockResolvedValue({ data: [[0.1]] });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await expect(provider.embed(["a", "b"])).rejects.toThrow(/unexpected shape/);
  });
});

describe("WorkersAiProvider.listModels", () => {
  it("includes text generation and embeddings with pricing", async () => {
    const models = vi.fn().mockResolvedValue([
      {
        name: "@cf/openai/gpt-oss-20b",
        task: { name: "Text Generation" },
        properties: [
          { property_id: "price", value: [{ unit: "per M input tokens", price: 0.2, currency: "USD" }] },
        ],
      },
      {
        name: "@cf/google/embeddinggemma-300m",
        task: { name: "Text Embeddings" },
        properties: [{ property_id: "output_dimensions", value: "768" }],
      },
      {
        name: "@cf/lykon/dreamshaper-8-lcm",
        task: { name: "Text-to-Image" },
      },
    ]);
    const provider = new WorkersAiProvider({ run: vi.fn(), models } as never);
    const listed = await provider.listModels();
    expect(listed.some((m) => m.value === "@cf/openai/gpt-oss-20b" && m.pricing?.[0].price === 0.2)).toBe(true);
    expect(listed.some((m) => m.value === "@cf/google/embeddinggemma-300m")).toBe(true);
    expect(listed.some((m) => m.value === "@cf/lykon/dreamshaper-8-lcm")).toBe(false);
  });

  it("hides Clef even though the catalog lists it as Text Generation", async () => {
    const models = vi.fn().mockResolvedValue([
      { name: "@cf/cloudflare/clef", task: { name: "Text Generation" } },
      { name: "@cf/cloudflare/clef-flash", task: { name: "Text Generation" } },
    ]);
    const provider = new WorkersAiProvider({ run: vi.fn(), models } as never);
    const listed = await provider.listModels();
    expect(listed.some((m) => m.value.includes("clef"))).toBe(false);
  });

  it("surfaces GPT-6 partner models even without a catalog entry", async () => {
    const provider = new WorkersAiProvider({ run: vi.fn(), models: vi.fn().mockResolvedValue([]) } as never);
    const listed = await provider.listModels();
    expect(listed.some((m) => m.value === "openai/gpt-6-luna")).toBe(true);
    expect(listed.some((m) => m.value === "openai/gpt-6-sol")).toBe(true);
  });
});
