import { describe, it, expect } from "vitest";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  isCompatibleEmbeddingModel,
  isEmbeddingTask,
  isWorkersAiModelId,
} from "../config/deployment";

describe("Workers AI model ids", () => {
  it("recognises Workers AI model ids by their namespace", () => {
    expect(isWorkersAiModelId("@cf/meta/llama-3.1-8b-instruct")).toBe(true);
    expect(isWorkersAiModelId("@hf/mistral/mistral-7b-instruct-v0.2")).toBe(true);
    expect(isWorkersAiModelId("minimax/m3")).toBe(true);
    expect(isWorkersAiModelId("@cf/zai-org/glm-5.3-flash")).toBe(true);
  });

  it("rejects external gateway model ids", () => {
    expect(isWorkersAiModelId("claude-sonnet-4-6")).toBe(false);
    expect(isWorkersAiModelId("gpt-4o")).toBe(false);
  });

  it("defaults to GLM-5.3-flash on Workers AI", () => {
    expect(DEFAULT_WORKERS_AI_MODEL).toBe("@cf/zai-org/glm-5.3-flash");
    expect(isWorkersAiModelId(DEFAULT_WORKERS_AI_MODEL)).toBe(true);
  });

  it("defaults embedding to EmbeddingGemma 300M", () => {
    expect(DEFAULT_EMBEDDING_MODEL).toBe("@cf/google/embeddinggemma-300m");
    expect(isCompatibleEmbeddingModel(DEFAULT_EMBEDDING_MODEL)).toBe(true);
    expect(isCompatibleEmbeddingModel("@cf/baai/bge-base-en-v1.5")).toBe(true);
    expect(isCompatibleEmbeddingModel("@cf/baai/bge-small-en-v1.5", 384)).toBe(false);
    expect(isCompatibleEmbeddingModel("@cf/baai/bge-large-en-v1.5", 1024)).toBe(false);
    expect(isCompatibleEmbeddingModel("@cf/qwen/qwen3-embedding-0.6b", 768)).toBe(true);
    expect(isEmbeddingTask("Text Embeddings")).toBe(true);
    expect(isEmbeddingTask("Text Generation")).toBe(false);
  });
});
