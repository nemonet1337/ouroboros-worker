import { describe, it, expect, vi } from "vitest";
import { extractCompletionText, isPartnerModelId, WorkersAiProvider } from "../adapters/workers-ai.provider";

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
