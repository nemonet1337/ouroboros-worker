import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dispatch } from "../webhook/dispatcher";
import { WebhookEndpoint } from "../types";

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: "ep-001",
    name: "Test Endpoint",
    url: "https://example.com/webhook",
    adapter: "generic",
    events: ["inspection.completed"],
    enabled: true,
    ...overrides,
  };
}

const ok200 = { ok: true, status: 200, statusText: "OK" };
const err400 = { ok: false, status: 400, statusText: "Bad Request" };
const err500 = { ok: false, status: 500, statusText: "Internal Server Error" };

describe("dispatch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok200));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the endpoint URL", async () => {
    await dispatch({ body: { x: 1 }, endpoint: makeEndpoint(), event: "inspection.completed" });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("returns success: true and statusCode 200 on OK response", async () => {
    const result = await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attemptCount).toBe(1);
  });

  it("returns success: false on 4xx without retrying", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(err400));
    const result = await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sets Content-Type: application/json", async () => {
    await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("sets User-Agent header", async () => {
    await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["User-Agent"]).toMatch(/^ouroboros-webhook/);
  });

  it("adds HMAC-SHA256 signature header when secret is configured", async () => {
    await dispatch({ body: { test: true }, endpoint: makeEndpoint({ secret: "s3cr3t" }), event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["X-Ouroboros-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("signature is absent when no secret is configured", async () => {
    await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["X-Ouroboros-Signature"]).toBeUndefined();
  });

  it("merges custom headers from endpoint config", async () => {
    const endpoint = makeEndpoint({ headers: { Authorization: "Bearer token123", "X-Custom": "val" } });
    await dispatch({ body: {}, endpoint, event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["Authorization"]).toBe("Bearer token123");
    expect(opts.headers["X-Custom"]).toBe("val");
  });

  it("serialises the body as JSON", async () => {
    const body = { event: "inspection.completed", score: 88 };
    await dispatch({ body, endpoint: makeEndpoint(), event: "inspection.completed" });
    const [, opts] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual(body);
  });

  it("returns error message on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
    );
    const result = await dispatch({ body: {}, endpoint: makeEndpoint(), event: "inspection.completed" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});
