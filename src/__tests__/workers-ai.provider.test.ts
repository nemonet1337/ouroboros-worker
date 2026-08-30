import { describe, it, expect, vi } from "vitest";
import { extractCompletionText, isPartnerModelId, mapCatalogModel, WorkersAiProvider } from "../adapters/workers-ai.provider";
import { DEFAULT_EMBEDDING_MODEL } from "../config/deployment";

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
    expect(isPartnerModelId("minimax/m3")).toBe(true);
    expect(isPartnerModelId("@cf/zai-org/glm-5.3-flash")).toBe(false);
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

  it("uses binding for catalog models even when REST credentials are set", async () => {
    const run = vi.fn().mockResolvedValue({ response: "bound" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never, {
      apiToken: "tok",
      accountId: "acc",
    });
    expect(await provider.complete({ system: "s", prompt: "p", model: "@cf/zai-org/glm-5.3-flash" })).toBe("bound");
    expect(run).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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
  it("uses the given model id, defaulting to EmbeddingGemma", async () => {
    const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
    const provider = new WorkersAiProvider({ run, models: vi.fn() } as never);
    await provider.embed(["hello"]);
    expect(run).toHaveBeenCalledWith(DEFAULT_EMBEDDING_MODEL, { text: ["hello"] });

    run.mockClear();
    await provider.embed(["hello"], "@cf/baai/bge-base-en-v1.5");
    expect(run).toHaveBeenCalledWith("@cf/baai/bge-base-en-v1.5", { text: ["hello"] });
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
});
