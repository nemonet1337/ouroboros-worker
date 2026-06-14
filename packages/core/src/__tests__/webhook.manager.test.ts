import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebhookManager } from "../webhook/webhook.manager";
import { WebhookEndpoint } from "../webhook/types";
import { AspectBreakdown, InspectionResult } from "../types/inspection.types";
import { ASPECTS, ASPECT_CATEGORY } from "../inspection/aspects";
import { DEFAULT_ASPECT_WEIGHTS } from "../config/inspection.config";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(overall = 75): InspectionResult {
  const aspectBreakdown = Object.fromEntries(
    ASPECTS.map((a) => [
      a,
      { score: overall, weight: DEFAULT_ASPECT_WEIGHTS[a], summary: "ok", category: ASPECT_CATEGORY[a] },
    ])
  ) as AspectBreakdown;
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    requestId: "req-00000000-0000-0000-0000-000000000001",
    completedAt: new Date().toISOString(),
    durationMs: 2000,
    language: "typescript",
    scoreCard: {
      overall,
      grade: overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : "D",
      breakdown: {
        security:    { score: overall, weight: 0.25, summary: "ok" },
        performance: { score: overall, weight: 0.20, summary: "ok" },
        redundancy:  { score: overall, weight: 0.15, summary: "ok" },
        readability: { score: overall, weight: 0.15, summary: "ok" },
        design:      { score: overall, weight: 0.15, summary: "ok" },
        correctness: { score: overall, weight: 0.10, summary: "ok" },
      },
      aspectBreakdown,
    },
    findings: [{ id: "f1", category: "performance", severity: "low", title: "minor issue",
      description: "d", location: { file: "a.ts", startLine: 1, endLine: 1, snippet: "" },
      impact: "low", scorePenalty: 3, hasRecommendation: false }],
    recommendations: [],
    files: [],
    refactorCandidates: [],
    summary: "テスト用サマリー文章です。問題は1件検出されました。",
    aiModel: "claude-sonnet-4-6",
    contentHash: "sha256:abc123",
  };
}

function makeEndpoint(overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint {
  return {
    id: "ep-001",
    name: "Test Endpoint",
    url: "https://hooks.example.com/test",
    adapter: "generic",
    events: ["inspection.completed"],
    enabled: true,
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WebhookManager.dispatch", () => {
  it("delivers to an enabled endpoint subscribed to inspection.completed", async () => {
    const mgr = new WebhookManager();
    const results = await mgr.dispatch(makeResult(), [makeEndpoint()]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].event).toBe("inspection.completed");
  });

  it("skips disabled endpoints", async () => {
    const mgr = new WebhookManager();
    const results = await mgr.dispatch(makeResult(), [makeEndpoint({ enabled: false })]);
    expect(results).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns empty array when no endpoints are configured", async () => {
    const mgr = new WebhookManager();
    const results = await mgr.dispatch(makeResult(), []);
    expect(results).toHaveLength(0);
  });

  it("fires threshold_breached when score falls below threshold", async () => {
    const mgr = new WebhookManager();
    const result = makeResult(55);
    const endpoint = makeEndpoint({
      events: ["inspection.threshold_breached"],
      scoreThresholds: { overall: 70 },
    });
    const results = await mgr.dispatch(result, [endpoint]);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBe("inspection.threshold_breached");
  });

  it("does not fire threshold_breached when scores are fine", async () => {
    const mgr = new WebhookManager();
    const result = makeResult(90);
    const endpoint = makeEndpoint({
      events: ["inspection.threshold_breached"],
      scoreThresholds: { overall: 70 },
    });
    const results = await mgr.dispatch(result, [endpoint]);
    expect(results).toHaveLength(0);
  });

  it("fires both completed and threshold_breached for one endpoint that subscribes to both", async () => {
    const mgr = new WebhookManager();
    const result = makeResult(50);
    const endpoint = makeEndpoint({
      events: ["inspection.completed", "inspection.threshold_breached"],
      scoreThresholds: { overall: 70 },
    });
    const results = await mgr.dispatch(result, [endpoint]);
    expect(results).toHaveLength(2);
    const events = results.map((r) => r.event);
    expect(events).toContain("inspection.completed");
    expect(events).toContain("inspection.threshold_breached");
  });

  it("delivers to multiple endpoints concurrently", async () => {
    const mgr = new WebhookManager();
    const endpoints = [
      makeEndpoint({ id: "ep-1", url: "https://a.example.com/hook" }),
      makeEndpoint({ id: "ep-2", url: "https://b.example.com/hook" }),
    ];
    const results = await mgr.dispatch(makeResult(), endpoints);
    expect(results).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("sends Slack Block Kit format for slack adapter", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint({ adapter: "slack" })]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toHaveProperty("attachments");
    expect(Array.isArray(body.attachments)).toBe(true);
  });

  it("sends Discord embed format for discord adapter", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint({ adapter: "discord" })]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toHaveProperty("embeds");
    expect(Array.isArray(body.embeds)).toBe(true);
    expect(body.embeds[0]).toHaveProperty("color");
  });

  it("sends GitHub PR comment format for github adapter", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint({ adapter: "github" })]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toHaveProperty("body");
    expect(typeof body.body).toBe("string");
    expect(body.body).toContain("ouroboros");
  });

  it("generic adapter sends canonical WebhookPayload", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint({ adapter: "generic" })]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.event).toBe("inspection.completed");
    expect(body.inspection).toBeDefined();
    expect(body.inspection.findingCount).toBe(1);
  });

  it("adds HMAC signature when secret is configured", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint({ secret: "webhook-secret" })]);
    const headers = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
    expect(headers["X-Ouroboros-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("includes resultUrl in payload when provided via context", async () => {
    const mgr = new WebhookManager();
    await mgr.dispatch(makeResult(), [makeEndpoint()], { resultUrl: "https://ui.example.com/results/abc" });
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.inspection.url).toBe("https://ui.example.com/results/abc");
  });

  it("marks delivery failed on 4xx HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, statusText: "Unprocessable Entity" }));
    const mgr = new WebhookManager();
    const results = await mgr.dispatch(makeResult(), [makeEndpoint()]);
    expect(results[0].success).toBe(false);
    expect(results[0].statusCode).toBe(422);
  });

  it("records endpointId and endpointName in result", async () => {
    const mgr = new WebhookManager();
    const endpoint = makeEndpoint({ id: "my-endpoint", name: "My Slack" });
    const results = await mgr.dispatch(makeResult(), [endpoint]);
    expect(results[0].endpointId).toBe("my-endpoint");
    expect(results[0].endpointName).toBe("My Slack");
  });
});

describe("WebhookManager.dispatchError", () => {
  it("fires inspection.failed to subscribed endpoints", async () => {
    const mgr = new WebhookManager();
    const endpoint = makeEndpoint({ events: ["inspection.failed"] });
    const results = await mgr.dispatchError("Something went wrong", "req-abc", [endpoint]);
    expect(results).toHaveLength(1);
    expect(results[0].event).toBe("inspection.failed");
    expect(results[0].success).toBe(true);
  });

  it("does not deliver to endpoints not subscribed to inspection.failed", async () => {
    const mgr = new WebhookManager();
    const endpoint = makeEndpoint({ events: ["inspection.completed"] });
    const results = await mgr.dispatchError("error", "req-xyz", [endpoint]);
    expect(results).toHaveLength(0);
  });

  it("includes error text in generic payload", async () => {
    const mgr = new WebhookManager();
    const endpoint = makeEndpoint({ adapter: "generic", events: ["inspection.failed"] });
    await mgr.dispatchError("AI call timed out", "req-123", [endpoint]);
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.error).toBe("AI call timed out");
    expect(body.event).toBe("inspection.failed");
  });
});
