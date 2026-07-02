import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DispatchRunner } from "../adapters/dispatch.runner";

describe("DispatchRunner", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should successfully post to runnerUrl", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ staticAnalysis: [] }), { status: 200 })
    );

    const runner = new DispatchRunner("http://runner.example.com", "secret123");
    const result = await runner.scan();

    expect(result.findings.staticAnalysis).toEqual([]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://runner.example.com/internal/scan",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-runner-secret": "secret123",
        },
      })
    );
  });

  it("should throw if runnerUrl is not set", async () => {
    const runner = new DispatchRunner("", "secret123");
    await expect(runner.scan()).rejects.toThrow("RUNNER_URL not configured for edge healing");
  });
});
