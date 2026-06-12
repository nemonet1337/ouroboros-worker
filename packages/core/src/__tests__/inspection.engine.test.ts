import { describe, it, expect, vi, beforeEach } from "vitest";
import { InspectionEngine } from "../inspection/inspection.engine";
import { InspectionRequest } from "../types/inspection.types";
import type { AiProvider } from "../ports/ai";

// ─── Mock AiProvider ───────────────────────────────────────────────────────────

const mockComplete = vi.fn();

function mockProvider(): AiProvider {
  return { name: "mock", complete: mockComplete };
}

function defaultOutput(override: Partial<Record<string, unknown>> = {}) {
  return {
    summary: "テストサマリー: 軽微な問題が1件検出されました。",
    files: [
      {
        path: "src/index.ts",
        scoreBreakdown: {
          security:    { score: 85, summary: "重大な脆弱性なし" },
          performance: { score: 75, summary: "軽微なループ問題" },
          redundancy:  { score: 90, summary: "重複は最小限" },
          readability: { score: 85, summary: "可読性は高い" },
          design:      { score: 80, summary: "設計は概ね良好" },
          correctness: { score: 95, summary: "ロジックは正確" },
        },
        findings: [
          {
            id: "perf-loop-001",
            category: "performance",
            severity: "low",
            title: "非効率なループ",
            description: "forEachの代わりにmapを使用できます",
            startLine: 10,
            endLine: 14,
            snippet: "arr.forEach(x => result.push(x * 2));",
            impact: "軽微なパフォーマンス改善の余地",
            scorePenalty: 5,
          },
        ],
        recommendations: [
          {
            findingId: "perf-loop-001",
            title: "map()への置き換え",
            before: "arr.forEach(x => result.push(x * 2));",
            after: "const result = arr.map(x => x * 2);",
            rationale: "mapは新配列を直接返し、pushによる副作用を排除します",
            impactDescription: "コードの簡潔性と可読性が向上します",
            effort: "trivial",
          },
        ],
      },
    ],
    ...override,
  };
}

function jsonResponse(override: Partial<Record<string, unknown>> = {}): string {
  return JSON.stringify(defaultOutput(override));
}

function makeRequest(override: Partial<InspectionRequest> = {}): InspectionRequest {
  return {
    id: "req-0000-0000-0000-000000000001",
    language: "typescript",
    files: [{ path: "src/index.ts", content: "const x = 1;" }],
    requestedAt: new Date().toISOString(),
    ...override,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("InspectionEngine.inspect", () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockComplete.mockResolvedValue(jsonResponse());
  });

  it("returns an InspectionResult with correct shape", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(result.language).toBe("typescript");
    expect(result.summary).toBe("テストサマリー: 軽微な問題が1件検出されました。");
    expect(result.files).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.recommendations).toHaveLength(1);
  });

  it("calculates a scoreCard with grade", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.scoreCard.overall).toBeGreaterThan(0);
    expect(["S", "A", "B", "C", "D", "F"]).toContain(result.scoreCard.grade);
  });

  it("populates recommendation diff from before/after", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.recommendations[0].diff).toContain("---");
    expect(result.recommendations[0].diff).toContain("+++");
  });

  it("sets hasRecommendation=true on findings that have a recommendation", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.findings[0].hasRecommendation).toBe(true);
  });

  it("attaches contentHash starting with sha256:", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("records durationMs > 0", async () => {
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("propagates requestId from request", async () => {
    const engine = new InspectionEngine(mockProvider());
    const req = makeRequest({ id: "req-test-id-1234" });
    const result = await engine.inspect(req);
    expect(result.requestId).toBe("req-test-id-1234");
  });

  it("respects maxFiles preprocessing limit", async () => {
    const engine = new InspectionEngine(mockProvider(), {
      preprocessing: { maxFiles: 1, maxFileSizeBytes: 50_000 },
    });
    const req = makeRequest({
      files: [
        { path: "a.ts", content: "const a = 1;" },
        { path: "b.ts", content: "const b = 2;" },
      ],
    });
    await engine.inspect(req);
    const callArg = mockComplete.mock.calls[0][0];
    expect(callArg.prompt).toContain("a.ts");
    expect(callArg.prompt).not.toContain("b.ts");
  });

  it("retries on transient AI error and succeeds", async () => {
    mockComplete
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(jsonResponse());

    const engine = new InspectionEngine(mockProvider(), { ai: { model: "claude-sonnet-4-6", maxTokens: 8192, maxRetries: 2 } });
    const result = await engine.inspect(makeRequest());
    expect(result.findings).toHaveLength(1);
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting all retries", async () => {
    mockComplete.mockRejectedValue(new Error("persistent error"));
    const engine = new InspectionEngine(mockProvider(), { ai: { model: "claude-sonnet-4-6", maxTokens: 8192, maxRetries: 1 } });
    await expect(engine.inspect(makeRequest())).rejects.toThrow("persistent error");
  });

  it("builds per-function results when the AI returns a functions array", async () => {
    const base = defaultOutput();
    const file = (base.files as Record<string, unknown>[])[0];
    file.functions = [
      {
        name: "UserService.getUsersByRole",
        startLine: 5,
        endLine: 20,
        scoreBreakdown: {
          security:    { score: 40, summary: "入力検証なし" },
          performance: { score: 30, summary: "O(n^2) ループ" },
          redundancy:  { score: 70, summary: "軽微な重複" },
          readability: { score: 75, summary: "概ね読みやすい" },
          design:      { score: 80, summary: "責務は明確" },
          correctness: { score: 85, summary: "ロジックは正確" },
        },
        findings: [],
        recommendations: [],
      },
    ];
    mockComplete.mockResolvedValue(JSON.stringify(base));

    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(
      makeRequest({ options: { granularity: "function" } })
    );

    const fns = result.files[0].functions;
    expect(fns).toHaveLength(1);
    expect(fns![0].name).toBe("UserService.getUsersByRole");
    expect(fns![0].scoreCard.breakdown.security.score).toBe(40);
    expect(fns![0].location).toMatchObject({ file: "src/index.ts", startLine: 5, endLine: 20 });
  });

  it("emits refactorCandidates for low-scoring units, ranked by priorityScore", async () => {
    const base = defaultOutput();
    const file = (base.files as Record<string, unknown>[])[0];
    file.functions = [
      {
        name: "lowScore",
        startLine: 1,
        endLine: 10,
        scoreBreakdown: {
          security:    { score: 20, summary: "SQLi の疑い" },
          performance: { score: 30, summary: "非効率" },
          redundancy:  { score: 50, summary: "重複あり" },
          readability: { score: 55, summary: "読みにくい" },
          design:      { score: 60, summary: "結合度高" },
          correctness: { score: 70, summary: "概ね正確" },
        },
        findings: [],
        recommendations: [],
      },
      {
        name: "highScore",
        startLine: 11,
        endLine: 20,
        scoreBreakdown: {
          security:    { score: 95, summary: "問題なし" },
          performance: { score: 95, summary: "問題なし" },
          redundancy:  { score: 95, summary: "問題なし" },
          readability: { score: 95, summary: "問題なし" },
          design:      { score: 95, summary: "問題なし" },
          correctness: { score: 95, summary: "問題なし" },
        },
        findings: [],
        recommendations: [],
      },
    ];
    mockComplete.mockResolvedValue(JSON.stringify(base));

    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(
      makeRequest({ options: { granularity: "function" } })
    );

    expect(result.refactorCandidates).toHaveLength(1);
    expect(result.refactorCandidates[0].name).toBe("lowScore");
    expect(result.refactorCandidates[0].unit).toBe("function");
    expect(result.refactorCandidates[0].weakestDimensions[0]).toBe("security");
  });

  it("instructs the AI about function granularity in the prompt", async () => {
    const engine = new InspectionEngine(mockProvider());
    await engine.inspect(makeRequest({ options: { granularity: "function" } }));
    const callArg = mockComplete.mock.calls[0][0];
    expect(callArg.prompt).toContain("functions");
    expect(callArg.prompt).toContain("関数・メソッド・クラス");
  });

  it("handles empty findings gracefully", async () => {
    mockComplete.mockResolvedValue(
      jsonResponse({
        files: [
          {
            path: "src/clean.ts",
            scoreBreakdown: {
              security:    { score: 100, summary: "完璧" },
              performance: { score: 100, summary: "完璧" },
              redundancy:  { score: 100, summary: "完璧" },
              readability: { score: 100, summary: "完璧" },
              design:      { score: 100, summary: "完璧" },
              correctness: { score: 100, summary: "完璧" },
            },
            findings: [],
            recommendations: [],
          },
        ],
      })
    );
    const engine = new InspectionEngine(mockProvider());
    const result = await engine.inspect(makeRequest());
    expect(result.findings).toHaveLength(0);
    expect(result.scoreCard.overall).toBe(100);
    expect(result.scoreCard.grade).toBe("S");
  });
});
