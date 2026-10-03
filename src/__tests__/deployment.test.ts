import { describe, it, expect } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  EMBED_BATCH_LIMIT,
  isDecisionModel,
  isEmbeddingTask,
  isWorkersAiModelId,
  remapRetiredModel,
} from "../config/deployment";
import { DEFAULT_ROUTING_CONFIG, parseRoutingConfig } from "../config/routing";

describe("Workers AI model ids", () => {
  it("recognises Workers AI model ids by their namespace", () => {
    expect(isWorkersAiModelId("@cf/meta/llama-3.1-8b-instruct")).toBe(true);
    expect(isWorkersAiModelId("@hf/mistral/mistral-7b-instruct-v0.2")).toBe(true);
    expect(isWorkersAiModelId("minimax/m3")).toBe(true);
    expect(isWorkersAiModelId("openai/gpt-6-luna")).toBe(true);
  });

  it("rejects external gateway model ids", () => {
    expect(isWorkersAiModelId("claude-sonnet-4-6")).toBe(false);
    expect(isWorkersAiModelId("gpt-4o")).toBe(false);
  });

  it("defaults text generation to GPT-6 Luna", () => {
    expect(DEFAULT_WORKERS_AI_MODEL).toBe("openai/gpt-6-luna");
    expect(isWorkersAiModelId(DEFAULT_WORKERS_AI_MODEL)).toBe(true);
  });

  it("defaults embedding to Qwen3 Embedding 0.6B", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(isEmbeddingTask("Text Embeddings")).toBe(true);
    expect(isEmbeddingTask("Text Generation")).toBe(false);
  });

  it("batches embedding at the model's maxItems limit", () => {
    expect(EMBED_BATCH_LIMIT).toBe(32);
  });

  it("treats Clef as a decision model, not a text generator", () => {
    expect(isDecisionModel("@cf/cloudflare/clef")).toBe(true);
    expect(isDecisionModel("@cf/cloudflare/clef-flash")).toBe(true);
    expect(isDecisionModel("openai/gpt-6-luna")).toBe(false);
    expect(isDecisionModel("@cf/moonshotai/kimi-k2.6")).toBe(false);
  });

  it("remaps retired GLM ids on read without touching stored values", () => {
    expect(remapRetiredModel("@cf/zai-org/glm-5.3-flash")).toBe("openai/gpt-6-luna");
    expect(remapRetiredModel("openai/gpt-6-sol")).toBe("openai/gpt-6-sol");
    expect(remapRetiredModel(null)).toBeNull();
    expect(remapRetiredModel(undefined)).toBeNull();
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

  it("defaults the three roles to Luna / Sol / Qwen3", () => {
    expect(DEFAULT_ROUTING_CONFIG.efficiencyModel).toBe("openai/gpt-6-luna");
    expect(DEFAULT_ROUTING_CONFIG.performanceModel).toBe("openai/gpt-6-sol");
    expect(DEFAULT_ROUTING_CONFIG.embedModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });

  it("keeps model ids and thresholds that are valid", () => {
    const parsed = parseRoutingConfig({
      clefModel: "@cf/cloudflare/clef",
      solThreshold: 5,
      efficiencyModel: "openai/gpt-6-luna",
      performanceModel: "openai/gpt-6-sol",
      embedModel: "@cf/baai/bge-base-en-v1.5",
    });
    expect(parsed.clefModel).toBe("@cf/cloudflare/clef");
    expect(parsed.solThreshold).toBe(5);
    expect(parsed.embedModel).toBe("@cf/baai/bge-base-en-v1.5");
  });

  it("falls back to the default embed model when it is missing or blank", () => {
    expect(parseRoutingConfig({}).embedModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(parseRoutingConfig({ embedModel: "" }).embedModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
    expect(parseRoutingConfig({ embedModel: 42 }).embedModel).toBe("@cf/qwen/qwen3-embedding-0.6b");
  });
});
