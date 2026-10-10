import { describe, it, expect } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TEXT_MODEL,
  EMBED_BATCH_LIMIT,
  isEmbeddingTask,
  isEmbeddingProvider,
  isEmbeddableModelId,
  isProviderModelId,
  providerOfModel,
  remapRetiredModel,
  resolveDefaultEmbeddingModel,
} from "../config/deployment";
import { DEFAULT_ROUTING_CONFIG, parseRoutingConfig } from "../config/routing";

describe("provider model ids", () => {
  it("recognises provider-namespaced model ids", () => {
    expect(isProviderModelId("openai/gpt-6-luna")).toBe(true);
    expect(isProviderModelId("anthropic/claude-sonnet-4-6")).toBe(true);
    expect(isProviderModelId("xai/grok-4")).toBe(true);
    expect(isProviderModelId("openrouter/openai/gpt-6-luna")).toBe(true);
  });

  it("rejects unnamespaced external model ids", () => {
    expect(isProviderModelId("claude-sonnet-4-6")).toBe(false);
    expect(isProviderModelId("gpt-4o")).toBe(false);
    expect(isProviderModelId("@cf/meta/llama-3.1-8b-instruct")).toBe(false);
  });

  it("extracts the provider segment", () => {
    expect(providerOfModel("openai/gpt-6-luna")).toBe("openai");
    expect(providerOfModel("openrouter/openai/gpt-6-luna")).toBe("openrouter");
    expect(providerOfModel("mistral/mistral-7b")).toBeNull();
  });

  it("defaults text generation to GPT-6 Luna", () => {
    expect(DEFAULT_TEXT_MODEL).toBe("openai/gpt-6-luna");
    expect(isProviderModelId(DEFAULT_TEXT_MODEL)).toBe(true);
  });

  it("defaults embedding to OpenAI text-embedding-3-small", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
    expect(isEmbeddingTask("Text Embeddings")).toBe(true);
    expect(isEmbeddingTask("Text Generation")).toBe(false);
  });

  it("batches embedding at 32 items", () => {
    expect(EMBED_BATCH_LIMIT).toBe(32);
  });

  it("knows which providers support embedding", () => {
    expect(isEmbeddingProvider("openai")).toBe(true);
    expect(isEmbeddingProvider("xai")).toBe(true);
    expect(isEmbeddingProvider("openrouter")).toBe(true);
    expect(isEmbeddingProvider("anthropic")).toBe(false);
  });

  it("rejects anthropic embedding models", () => {
    expect(isEmbeddableModelId("openai/text-embedding-3-small")).toBe(true);
    expect(isEmbeddableModelId("anthropic/claude-sonnet-4-6")).toBe(false);
    expect(isEmbeddableModelId("text-embedding-3-small")).toBe(false);
  });

  it("remaps retired Cloudflare / GLM ids to null so defaults apply", () => {
    expect(remapRetiredModel("@cf/zai-org/glm-5.3-flash")).toBeNull();
    expect(remapRetiredModel("@cf/cloudflare/clef-flash")).toBeNull();
    expect(remapRetiredModel("openai/gpt-6-sol")).toBe("openai/gpt-6-sol");
    expect(remapRetiredModel(null)).toBeNull();
    expect(remapRetiredModel(undefined)).toBeNull();
  });

  it("resolves the embedding fallback chain", () => {
    expect(resolveDefaultEmbeddingModel(["openai"])).toBe("openai/text-embedding-3-small");
    expect(resolveDefaultEmbeddingModel(["openrouter"])).toBe(
      "openrouter/openai/text-embedding-3-small"
    );
    expect(resolveDefaultEmbeddingModel(["anthropic"])).toBeNull();
  });
});

describe("parseRoutingConfig", () => {
  it("falls back to defaults for malformed input", () => {
    expect(parseRoutingConfig(null)).toEqual(DEFAULT_ROUTING_CONFIG);
    expect(parseRoutingConfig("nope")).toEqual(DEFAULT_ROUTING_CONFIG);
    expect(parseRoutingConfig([1, 2])).toEqual(DEFAULT_ROUTING_CONFIG);
  });

  it("clamps the threshold to 1..5", () => {
    expect(parseRoutingConfig({ solThreshold: 0 }).solThreshold).toBe(4);
    expect(parseRoutingConfig({ solThreshold: 9 }).solThreshold).toBe(4);
    expect(parseRoutingConfig({ solThreshold: 3 }).solThreshold).toBe(3);
  });

  it("drops unknown effort values", () => {
    expect(parseRoutingConfig({ efficiencyEffort: "turbo" }).efficiencyEffort).toBe("low");
    expect(parseRoutingConfig({ performanceEffort: "high" }).performanceEffort).toBe("high");
  });

  it("defaults the three roles to Luna / Sol / text-embedding-3-small", () => {
    expect(DEFAULT_ROUTING_CONFIG.efficiencyModel).toBe("openai/gpt-6-luna");
    expect(DEFAULT_ROUTING_CONFIG.performanceModel).toBe("openai/gpt-6-sol");
    expect(DEFAULT_ROUTING_CONFIG.embedModel).toBe("openai/text-embedding-3-small");
  });

  it("discards the legacy clefModel key and falls back to remote decisions", () => {
    const parsed = parseRoutingConfig({
      clefModel: "@cf/cloudflare/clef",
      solThreshold: 5,
      efficiencyModel: "openai/gpt-6-luna",
      performanceModel: "openai/gpt-6-sol",
      embedModel: "@cf/baai/bge-base-en-v1.5",
    });
    expect(parsed).not.toHaveProperty("clefModel");
    expect(parsed.routerModel).toBe(DEFAULT_ROUTING_CONFIG.routerModel);
    expect(parsed.solThreshold).toBe(5);
    expect(parsed.decisionBackend).toBe("remote");
    expect(parsed.embedModel).toBe(DEFAULT_EMBEDDING_MODEL);
  });

  it("carries the local Laya fields", () => {
    const parsed = parseRoutingConfig({
      decisionBackend: "local",
      localDecisionUrl: "http://127.0.0.1:9000",
      localDecisionModel: "english",
      localFileSelection: false,
    });
    expect(parsed.decisionBackend).toBe("local");
    expect(parsed.localDecisionUrl).toBe("http://127.0.0.1:9000");
    expect(parsed.localDecisionModel).toBe("english");
    expect(parsed.localFileSelection).toBe(false);
  });

  it("normalises an invalid decision backend to remote", () => {
    expect(parseRoutingConfig({ decisionBackend: "nope" } as never).decisionBackend).toBe("remote");
  });

  it("falls back to the default embed model when it is anthropic or blank", () => {
    expect(parseRoutingConfig({}).embedModel).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(parseRoutingConfig({ embedModel: "" }).embedModel).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(parseRoutingConfig({ embedModel: 42 }).embedModel).toBe(DEFAULT_EMBEDDING_MODEL);
    expect(parseRoutingConfig({ embedModel: "anthropic/claude-sonnet-4-6" }).embedModel).toBe(
      DEFAULT_EMBEDDING_MODEL
    );
  });

  it("keeps a valid embeddable embed model", () => {
    expect(parseRoutingConfig({ embedModel: "xai/embed-v1" }).embedModel).toBe("xai/embed-v1");
  });
});
