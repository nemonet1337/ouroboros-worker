import { describe, it, expect, vi } from "vitest";
import { RpcRunner } from "../adapters/rpc.runner";

describe("RpcRunner", () => {
  it("should successfully send scan post request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ staticAnalysis: [] }), { status: 200 })
    );
    const mockService = { fetch: mockFetch };
    const runner = new RpcRunner(mockService);

    const result = await runner.scan();
    expect(result.findings.staticAnalysis).toEqual([]);
    expect(result.findings.dependency).toEqual([]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://internal/internal/scan",
        method: "POST",
      })
    );
  });

  it("normalizes legacy codeql wire format from an old runner", async () => {
    const legacy = {
      codeql: [
        {
          ruleId: "js/sql-injection",
          severity: "error",
          message: "SQL injection",
          location: { file: "src/db.ts", startLine: 42, endLine: 42, snippet: "" },
        },
      ],
    };
    const mockService = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(legacy), { status: 200 })),
    };
    const runner = new RpcRunner(mockService);

    const result = await runner.scan();
    expect(result.findings.staticAnalysis).toHaveLength(1);
    const f = result.findings.staticAnalysis[0];
    expect(f.ruleId).toBe("js/sql-injection");
    expect(f.severity).toBe("high"); // error → high
    expect(f.file).toBe("src/db.ts");
    expect(f.line).toBe(42);
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
