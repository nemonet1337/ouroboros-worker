import { describe, it, expect, vi } from "vitest";
import { RpcRunner } from "../adapters/rpc.runner";

describe("RpcRunner", () => {
  it("should successfully send scan post request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ codeql: [] }), { status: 200 })
    );
    const mockService = { fetch: mockFetch };
    const runner = new RpcRunner(mockService);

    const result = await runner.scan();
    expect(result.findings).toEqual({ codeql: [] });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://internal/internal/scan",
        method: "POST",
      })
    );
  });

  it("should throw error if response is not ok", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 })
    );
    const mockService = { fetch: mockFetch };
    const runner = new RpcRunner(mockService);

    await expect(runner.scan()).rejects.toThrow("runner /internal/scan -> 500: Internal Server Error");
  });
});
