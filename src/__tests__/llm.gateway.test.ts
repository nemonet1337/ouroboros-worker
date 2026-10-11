import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LlmGateway } from "../ai/gateway";
import type { AiCompletionRequest } from "../ai/types";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const KEYS = {
  openaiKey: "openai-key",
  anthropicKey: "anthropic-key",
  xaiKey: "xai-key",
  openrouterKey: "openrouter-key",
  layaKey: "laya-key",
};

const COMPLETE: AiCompletionRequest = { system: "sys", prompt: "pro", maxTokens: 100 };

/** 譛蠕後↓蜻ｼ縺ｰ繧後◆ fetch 縺ｮ URL 縺ｨ body 繧定ｨ倬鹸縺吶ｋ縲・*/
function recorder(responder?: (url: string, init: RequestInit) => Response): {
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return responder ? responder(url, init ?? {}) : json({});
    })
  );
  return { calls };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LlmGateway.complete", () => {
  it("routes openai/* to api.openai.com with a bearer token", async () => {
    const { calls } = recorder(() =>
      json({
        choices: [{ message: { content: "hello" } }],
        usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10, prompt_tokens_details: { cached_tokens: 2 } },
      })
    );
    const usage = vi.fn();
    const gw = new LlmGateway({ ...KEYS, onUsage: usage });

    const text = await gw.complete({ ...COMPLETE, model: "openai/gpt-6-luna" });

    expect(text).toBe("hello");
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer openai-key");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("gpt-6-luna");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "pro" },
    ]);
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 7, completionTokens: 3, cachedTokens: 2 })
    );
  });

  it("routes xai/* to api.x.ai chat completions", async () => {
    const { calls } = recorder(() => json({ choices: [{ message: { content: "grok" } }] }));
    const gw = new LlmGateway({ ...KEYS });

    await gw.complete({ ...COMPLETE, model: "xai/grok-4" });

    expect(calls[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect(JSON.parse(calls[0].init.body as string).model).toBe("grok-4");
  });

  it("routes openrouter/* to openrouter.ai", async () => {
    const { calls } = recorder(() => json({ choices: [{ message: { content: "or" } }] }));
    const gw = new LlmGateway({ ...KEYS });

    await gw.complete({ ...COMPLETE, model: "openrouter/openai/gpt-6-luna" });

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(calls[0].init.body as string).model).toBe("openai/gpt-6-luna");
  });

  it("routes anthropic/* with x-api-key, version, max_tokens and top-level system", async () => {
    const { calls } = recorder(() =>
      json({
        content: [
          { type: "text", text: "part1 " },
          { type: "tool_use", name: "x" },
          { type: "text", text: "part2" },
        ],
        usage: { input_tokens: 11, output_tokens: 5 },
      })
    );
    const usage = vi.fn();
    const gw = new LlmGateway({ ...KEYS, onUsage: usage });

    const text = await gw.complete({ ...COMPLETE, model: "anthropic/claude-sonnet-4-6" });

    expect(text).toBe("part1 part2");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("anthropic-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("claude-sonnet-4-6");
    expect(body.max_tokens).toBe(100);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "pro" }]);
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 11, completionTokens: 5, cachedTokens: 0 })
    );
  });

  it("throws for an unknown provider prefix", async () => {
    const gw = new LlmGateway({ ...KEYS });
    await expect(gw.complete({ ...COMPLETE, model: "mistral/mistral-7b" })).rejects.toThrow(
      /no API key/
    );
  });

  it("throws when the provider key is not configured", async () => {
    const gw = new LlmGateway({ openaiKey: "k" });
    await expect(gw.complete({ ...COMPLETE, model: "anthropic/claude-sonnet-4-6" })).rejects.toThrow(
      /anthropic/
    );
  });
});

describe("LlmGateway.embed", () => {
  it("posts openai embeddings and splits at 32 items", async () => {
    const { calls } = recorder((url, init) => {
      const body = JSON.parse(init?.body as string) as { input: string[] };
      return json({ data: body.input.map(() => ({ embedding: [1, 2] })) });
    });
    const gw = new LlmGateway({ ...KEYS });

    const texts = Array.from({ length: 33 }, (_, i) => `t${i}`);
    const vectors = await gw.embed(texts, "openai/text-embedding-3-small");

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(calls[0].init.body as string).input).toHaveLength(32);
    expect(JSON.parse(calls[1].init.body as string).input).toHaveLength(1);
    expect(vectors).toHaveLength(33);
  });

  it("routes openrouter embeddings to the openrouter host", async () => {
    const { calls } = recorder(() => json({ data: [{ embedding: [9] }] }));
    const gw = new LlmGateway({ ...KEYS });

    await gw.embed(["a"], "openrouter/openai/text-embedding-3-small");

    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/embeddings");
  });

  it("routes xai embeddings to api.x.ai", async () => {
    const { calls } = recorder(() => json({ data: [{ embedding: [9] }] }));
    const gw = new LlmGateway({ ...KEYS });

    await gw.embed(["a"], "xai/embed-v1");

    expect(calls[0].url).toBe("https://api.x.ai/v1/embeddings");
  });

  it("throws for anthropic embeddings", async () => {
    stubFetch(async () => json({ data: [] }));
    const gw = new LlmGateway({ ...KEYS });
    await expect(gw.embed(["a"], "anthropic/claude-sonnet-4-6")).rejects.toThrow(/embedding/);
  });
});

describe("LlmGateway.listModels", () => {
  it("maps each provider's catalog and skips unconfigured keys", async () => {
    const { calls } = recorder((url) => {
      if (url.includes("api.openai.com")) return json({ data: [{ id: "gpt-6-luna" }] });
      if (url.includes("api.anthropic.com")) return json({ data: [{ id: "claude-sonnet-4-6" }] });
      if (url.includes("api.x.ai")) return json({ data: [{ id: "grok-4" }] });
      if (url.includes("openrouter.ai/api/v1/models"))
        return json({
          data: [
            {
              id: "openai/gpt-6-luna",
              name: "GPT-6 Luna (OR)",
              context_length: 1_050_000,
              pricing: { prompt: "0.000001", completion: "0.000002" },
            },
          ],
        });
      return json({ data: [{ id: "openai/text-embedding-3-small", name: "embed" }] });
    });
    const gw = new LlmGateway({ openaiKey: "k", anthropicKey: "k", openrouterKey: "k" });

    const models = await gw.listModels();
    const values = models.map((m) => m.value);

    // xai 縺ｮ繧ｭ繝ｼ縺ｯ譛ｪ險ｭ螳・竊・蛟呵｣懊↓蜃ｺ縺ｪ縺・    expect(values).not.toContain("xai/grok-4");
    expect(values).toContain("openai/gpt-6-luna");
    expect(values).toContain("anthropic/claude-sonnet-4-6");
    expect(values).toContain("openrouter/openai/gpt-6-luna");

    const or = models.find((m) => m.value === "openrouter/openai/gpt-6-luna")!;
    expect(or.label).toBe("GPT-6 Luna (OR)");
    expect(or.contextWindow).toBe(1_050_000);
    expect(or.pricing).toEqual([
      { unit: "input", price: 0.000001, currency: "USD" },
      { unit: "output", price: 0.000002, currency: "USD" },
    ]);

    // openrouter embeddings catalog 繧ょ呵｣懊↓蜈･繧・    expect(values).toContain("openrouter/openai/text-embedding-3-small");

    // 譛ｪ險ｭ螳壹・繝ｭ繝舌う繝縺ｮ URL 縺ｯ蜿ｩ縺九↑縺・    expect(calls.some((c) => c.url.includes("api.x.ai"))).toBe(false);
  });

  it("caches the catalog for an hour", async () => {
    let count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        count++;
        return json({ data: [{ id: "gpt-6-luna" }] });
      })
    );
    const gw = new LlmGateway({ openaiKey: "k" });

    await gw.listModels();
    await gw.listModels();

    expect(count).toBe(1);
  });
});

describe("LlmGateway.decide", () => {
  it("sends an OpenAI Decisions request and normalises score +1", async () => {
    const { calls } = recorder(() =>
      json({
        answers: [
          // level index 0 襍ｷ轤ｹ縺ｮ遒ｺ邇・㍾縺ｿ蟷ｳ蝮・竊・0.1*1 + 0.6*2 + 0.3*3 = 2.2 竊・2
          { name: "difficulty", answer: { probabilities: { "0": 0.1, "1": 0.6, "2": 0.3 } } },
          // index 4 竊・5
          { name: "tier", answer: { choice: "performance" } },
        ],
      })
    );
    const gw = new LlmGateway({ ...KEYS });

    const res = await gw.decide({
      model: "openai/gpt-6-luna",
      state: "task",
      questions: {
        difficulty: { type: "score", instructions: "i", rubric: { "0": "a", "1": "b", "2": "c" } },
        tier: { type: "choice", instructions: "i", criteria: { efficiency: "e", performance: "p" } },
      },
    });

    expect(calls[0].url).toBe("https://api.openai.com/v1/decisions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("openai/gpt-6-luna");
    expect(body.input).toBe("task");
    expect(body.questions[0]).toMatchObject({ name: "difficulty", type: "score" });
    expect(body.questions[0].criteria).toEqual(["a", "b", "c"]);
    // index 0 襍ｷ轤ｹ 竊・1縲・ 縺ｫ豁｣隕丞喧
    expect(res.answers.difficulty).toMatchObject({ score: 2 });
    expect((res.answers.difficulty as { probabilities: Record<string, number> }).probabilities).toEqual({
      "1": 0.1,
      "2": 0.6,
      "3": 0.3,
    });
    expect((res.answers.tier as { choice: string }).choice).toBe("performance");
  });

  it("normalises a bare 0-based score index by +1", async () => {
    const { calls } = recorder(() => json({ answers: [{ name: "d", answer: { score: 4 } }] }));
    const gw = new LlmGateway({ ...KEYS });

    const res = await gw.decide({
      model: "openai/gpt-6-luna",
      state: "task",
      questions: { d: { type: "score", instructions: "i", rubric: { "0": "a", "4": "z" } } },
    });

    expect((res.answers.d as { score: number }).score).toBe(5);
    expect(calls[0].url).toContain("api.openai.com");
  });

  it("sends an OpenRouter Decisions request with a state and questions object", async () => {
    const { calls } = recorder(() => json({ answers: { difficulty: { score: 0 } } }));
    const gw = new LlmGateway({ ...KEYS });

    await gw.decide({
      model: "openrouter/typesafe/jev-1.13",
      state: "task",
      questions: { difficulty: { type: "score", instructions: "i", rubric: { "0": "a", "1": "b" } } },
    });

    expect(calls[0].url).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.model).toBe("openrouter/typesafe/jev-1.13");
    expect(body.state).toBe("task");
    expect(body.questions.difficulty).toMatchObject({ type: "score" });
  });

  it("falls back to remote when the local backend is unreachable", async () => {
    const { calls } = recorder((url) => {
      if (url.includes("127.0.0.1")) throw new Error("connect ECONNREFUSED");
      return json({ answers: { difficulty: { score: 3 } } });
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gw = new LlmGateway({ ...KEYS });

    const res = await gw.decide(
      {
        model: "openai/gpt-6-luna",
        state: "task",
        questions: { difficulty: { type: "score", instructions: "i", rubric: { "0": "a" } } },
      },
      { url: "http://127.0.0.1:8000", model: "typed-decisions" }
    );

    expect(warn).toHaveBeenCalled();
    expect(calls[0].url).toBe("http://127.0.0.1:8000/v1/systemone");
    expect(calls[1].url).toBe("https://api.openai.com/v1/decisions");
    expect((res.answers.difficulty as { score: number }).score).toBe(4);
  });

  it("throws for anthropic and xai decision models", async () => {
    stubFetch(async () => json({}));
    const gw = new LlmGateway({ ...KEYS });
    await expect(
      gw.decide({ model: "anthropic/claude-sonnet-4-6", state: "s", questions: {} })
    ).rejects.toThrow(/decisions/);
    await expect(gw.decide({ model: "xai/grok-4", state: "s", questions: {} })).rejects.toThrow(
      /decisions/
    );
  });
});
