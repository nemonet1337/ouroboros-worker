import { describe, it, expect } from "vitest";
import { EXTERNAL_GATEWAY_CONFIG_KEYS, isWorkersAiModelId } from "../config/deployment";

describe("deployment separation", () => {
  it("recognises Workers AI model ids by their namespace prefix", () => {
    expect(isWorkersAiModelId("@cf/meta/llama-3.1-8b-instruct")).toBe(true);
    expect(isWorkersAiModelId("@hf/mistral/mistral-7b-instruct-v0.2")).toBe(true);
  });

  it("rejects external gateway model ids", () => {
    expect(isWorkersAiModelId("claude-sonnet-4-6")).toBe(false);
    expect(isWorkersAiModelId("gpt-4o")).toBe(false);
    expect(isWorkersAiModelId("openrouter/auto")).toBe(false);
  });

  it("covers every external gateway token key stored in app config", () => {
    expect([...EXTERNAL_GATEWAY_CONFIG_KEYS]).toEqual([
      "anthropicToken",
      "openaiToken",
      "geminiToken",
      "openrouterToken",
    ]);
  });
});
