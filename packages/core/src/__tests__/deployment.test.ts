import { describe, it, expect } from "vitest";
import { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "../config/deployment";

describe("deployment separation", () => {
  it("recognises Workers AI model ids by their namespace", () => {
    expect(isWorkersAiModelId("@cf/meta/llama-3.1-8b-instruct")).toBe(true);
    expect(isWorkersAiModelId("@hf/mistral/mistral-7b-instruct-v0.2")).toBe(true);
    expect(isWorkersAiModelId("minimax/m3")).toBe(true);
  });

  it("rejects external gateway model ids", () => {
    expect(isWorkersAiModelId("claude-sonnet-4-6")).toBe(false);
    expect(isWorkersAiModelId("gpt-4o")).toBe(false);
  });

  it("defaults to minimax/m3 on Workers AI", () => {
    expect(DEFAULT_WORKERS_AI_MODEL).toBe("minimax/m3");
    expect(isWorkersAiModelId(DEFAULT_WORKERS_AI_MODEL)).toBe(true);
  });
});
