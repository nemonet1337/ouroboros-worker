/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { HealingPage } from "../ui/pages/healing";
import { HealingAnalysisPage } from "../ui/pages/healing-analysis";
import { HomePage } from "../ui/pages/home";
import { Sidebar } from "../ui/components/sidebar";
import type { HealingRunRow } from "../db/repositories";

function sampleRun(overrides: Partial<HealingRunRow> = {}): HealingRunRow {
  return {
    id: "run-abcdef12-0000-0000-0000-000000000001",
    user_id: "user-1",
    status: "analyzed",
    trigger: "gui",
    workflow_id: null,
    summary: JSON.stringify({
      analysis: {
        overall: 82,
        grade: "A",
        breakdown: { security: 70, correctness: 80, performance: 90, readability: 85, design: 75, redundancy: 88 },
        findingCount: 3,
        autoFixableCount: 1,
        summary: "テスト用サマリ",
      },
      groups: [
        {
          id: "g1",
          priority: "high",
          findings: [],
          autoFixable: true,
          estimatedRisk: "r",
          fixStrategy: { title: "XSS を直す", steps: ["fix"], rationale: "x" },
        },
      ],
    }),
    tag: null,
    inspection_id: "insp-1",
    model: "@cf/zai-org/glm-5.3-flash",
    prompt_tokens: 120,
    completion_tokens: 40,
    fix_model: null,
    fix_prompt_tokens: 0,
    fix_completion_tokens: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

describe("healing pages", () => {
  it("lists analyze CTA, optional instruction, and a single コード解析 nav item", async () => {
    const app = new Hono();
    app.get("/healing", (c) =>
      c.html(<HealingPage selectedRepo={{ owner: "acme", repo: "app" }} />)
    );
    const html = await (await app.request("/healing")).text();
    expect(html).toContain("解析を実行する");
    expect(html).toContain("解析の指示（任意）");
    expect(html).toContain("acme/app");
    expect(html).toContain("healing_fix_modal");
    expect(html).not.toContain("フル修復を実行する");
    expect(html).not.toContain("AI コード解析 (Inspection)");
    expect(html).not.toContain('href="/inspection"');
    expect(html).toContain("コード解析");
  });

  it("renders radar detail with model, tokens, and repair CTA", async () => {
    const app = new Hono();
    app.get("/healing/:id", (c) => c.html(<HealingAnalysisPage run={sampleRun()} result={null} />));
    const html = await (await app.request("/healing/run-1")).text();
    expect(html).toContain("6 次元レーダー");
    expect(html).toContain("テスト用サマリ");
    expect(html).toContain("in 120 / out 40");
    expect(html).toContain("修復を開始");
    expect(html).toContain("glm-5.3-flash");
    expect(html).toContain('aria-label="6 次元スコアのレーダーチャート"');
    expect(html).not.toContain("リファクタ提案を生成");
  });

  it("dashboard and sidebar point only at /healing for analysis", async () => {
    const app = new Hono();
    app.get("/", (c) => c.html(<HomePage />));
    app.get("/nav", (c) => c.html(<Sidebar />));
    const home = await (await app.request("/")).text();
    expect(home).toContain('href="/healing"');
    expect(home).not.toContain('href="/inspection"');
    const nav = await (await app.request("/nav")).text();
    expect(nav).toContain("コード解析");
    expect(nav).not.toContain("自己修復");
    expect(nav).not.toContain('href="/inspection"');
  });
});
