/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { ModelsPage } from "../ui/pages/models";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "../config/routing";
import type { AiModelInfo } from "../ports/ai";

const models: AiModelInfo[] = [
  { value: "openai/gpt-6-luna", label: "GPT-6 Luna", provider: "openai", task: "Text Generation" },
  { value: "openai/gpt-6-sol", label: "GPT-6 Sol", provider: "openai", task: "Text Generation" },
  {
    value: "openai/text-embedding-3-small",
    label: "text-embedding-3-small",
    provider: "openai",
    task: "Text Embeddings",
  },
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet", provider: "anthropic", task: "Text Generation" },
  { value: "openrouter/typesafe/jev-1.13", label: "Jev", provider: "openrouter", task: "Text Generation" },
];

const admin = { id: "u1", email: "a@b.c", role: "admin" as const, model: null, created_at: 1, updated_at: 1 };
const member = { id: "u2", email: "m@n.o", role: "member" as const, model: null, created_at: 1, updated_at: 1 };

async function html(props: {
  user: typeof admin | typeof member;
  models: AiModelInfo[];
  routing: RoutingConfig;
  selectedModel?: string | null;
}): Promise<string> {
  const app = new Hono();
  app.get("/", (c) => c.html(<ModelsPage {...props} />));
  return (await (await app.request("/")).text());
}

describe("ModelsPage", () => {
  it("shows the three roles with their default models", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    expect(out).toContain("Efficiency");
    expect(out).toContain("Performance");
    expect(out).toContain("Embed");
    expect(out).toContain("openai/gpt-6-luna");
    expect(out).toContain("openai/gpt-6-sol");
    expect(out).toContain("openai/text-embedding-3-small");
  });

  it("posts the field names parseRoutingConfig reads", async () => {
    const remote = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    for (const name of [
      "efficiencyModel",
      "performanceModel",
      "embedModel",
      "efficiencyEffort",
      "performanceEffort",
      "solThreshold",
      "decisionBackend",
      "routerModel",
    ]) {
      expect(remote).toContain(`name="${name}"`);
    }

    const local = await html({
      models,
      user: admin,
      routing: { ...DEFAULT_ROUTING_CONFIG, decisionBackend: "local" },
    });
    for (const name of ["localDecisionUrl", "localDecisionModel", "localFileSelection"]) {
      expect(local).toContain(`name="${name}"`);
    }
  });

  it("sends the role form to the routing endpoint as JSON", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    expect(out).toContain('hx-put="/api/v1/settings/routing"');
    expect(out).toContain('hx-ext="json-enc"');
  });

  it("reflects a customized selection", async () => {
    const out = await html({
      models,
      user: admin,
      routing: {
        ...DEFAULT_ROUTING_CONFIG,
        solThreshold: 2,
        efficiencyModel: "anthropic/claude-sonnet-4-6",
        embedModel: "openrouter/openai/text-embedding-3-small",
      },
    });
    expect(out).toContain('value="2"');
    expect(out).toContain("anthropic/claude-sonnet-4-6");
    expect(out).toContain("openrouter/openai/text-embedding-3-small");
  });

  it("disables the role inputs for non-admins", async () => {
    const out = await html({ models, user: member, routing: DEFAULT_ROUTING_CONFIG });
    expect(out).toContain("変更は管理者のみ可能です。");
    expect(out).toMatch(/id="embedModel"[^>]*disabled/);
  });

  it("keeps the per-user override separate from the role settings", async () => {
    const out = await html({
      models,
      user: admin,
      routing: DEFAULT_ROUTING_CONFIG,
      selectedModel: "openai/gpt-6-sol",
    });
    expect(out).toContain('hx-put="/api/v1/settings/models"');
    expect(out).toContain("難易度判定を無視して");
    expect(out).toContain('value="openai/gpt-6-sol"');
  });

  it("hides the decision (Jev) model from the selectable lists", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    const roleIds = ["text-gen-models", "efficiency-models", "performance-models", "embed-models"];
    const lists = (
      out.match(/<datalist id="[^"]*">[\s\S]*?<\/datalist>/g) ?? []
    )
      .filter((list) => roleIds.some((id) => list.includes(`id="${id}"`)))
      .join("");
    expect(lists).toContain("openai/gpt-6-luna");
    expect(lists).not.toContain("openrouter/typesafe/jev-1.13");
  });

  it("switches the decision card between remote and local Laya", async () => {
    const remote = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    expect(remote).toContain('name="routerModel"');
    expect(remote).not.toContain('name="localDecisionUrl"');

    const local = await html({
      models,
      user: admin,
      routing: {
        ...DEFAULT_ROUTING_CONFIG,
        decisionBackend: "local",
        localDecisionUrl: "http://127.0.0.1:9000",
        localDecisionModel: "english",
        localFileSelection: false,
      },
    });
    expect(local).toContain('value="http://127.0.0.1:9000"');
    expect(local).toContain('name="localFileSelection"');
    expect(local).toContain('id="laya-connection-test"');
    expect(local).not.toContain('name="routerModel"');
  });

  it("notes that anthropic and xai cannot serve decisions or embeddings", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    expect(out).toContain("anthropic/*");
    expect(out).toContain("xai/*");
  });
});
