/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { ModelsPage } from "../ui/pages/models";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "../config/routing";
import type { AiModelInfo } from "../ports/ai";

const models: AiModelInfo[] = [
  { value: "openai/gpt-6-luna", label: "GPT-6 Luna", provider: "workers-ai", task: "Text Generation" },
  { value: "openai/gpt-6-sol", label: "GPT-6 Sol", provider: "workers-ai", task: "Text Generation" },
  { value: "@cf/qwen/qwen3-embedding-0.6b", label: "Qwen3 Embedding", provider: "workers-ai", task: "Text Embeddings" },
  { value: "@cf/cloudflare/clef", label: "Clef", provider: "workers-ai", task: "Text Generation" },
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
    expect(out).toContain("@cf/qwen/qwen3-embedding-0.6b");
  });

  it("posts the field names parseRoutingConfig reads", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    for (const name of [
      "efficiencyModel",
      "performanceModel",
      "embedModel",
      "efficiencyEffort",
      "performanceEffort",
      "solThreshold",
      "clefModel",
    ]) {
      expect(out).toContain(`name="${name}"`);
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
        efficiencyModel: "@cf/moonshotai/kimi-k2.6",
        embedModel: "@cf/baai/bge-base-en-v1.5",
      },
    });
    expect(out).toContain('value="2"');
    expect(out).toContain("@cf/moonshotai/kimi-k2.6");
    expect(out).toContain("@cf/baai/bge-base-en-v1.5");
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
    expect(out).toContain("Clef の判定を無視して");
    expect(out).toContain('value="openai/gpt-6-sol"');
  });

  it("hides Clef from the selectable model lists", async () => {
    const out = await html({ models, user: admin, routing: DEFAULT_ROUTING_CONFIG });
    const lists = (out.match(/<datalist id="[^"]*">[\s\S]*?<\/datalist>/g) ?? []).join("");
    expect(lists).toContain("openai/gpt-6-luna");
    expect(lists).not.toContain("@cf/cloudflare/clef");
  });
});