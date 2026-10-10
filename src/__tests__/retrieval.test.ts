import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePathList, pickFilesByLuna } from "../retrieval/file.selector";
import { rankChunks } from "../retrieval/chunk.rank";
import { tokenize } from "../retrieval/tokenize";
import type { AiProvider } from "../ports";

function aiComplete(reply: string): AiProvider;
function aiComplete(reply: Error): AiProvider;
function aiComplete(reply: string | Error): AiProvider {
  const complete =
    typeof reply === "string" ? vi.fn().mockResolvedValue(reply) : vi.fn().mockRejectedValue(reply);
  return { name: "mock", complete } as unknown as AiProvider;
}

describe("parsePathList", () => {
  it("strips bullets, numbering and backticks", () => {
    const raw = ["- `src/a.ts`", "2. src/b.ts", "src/c.ts", "", "some prose here"].join("\n");
    expect(parsePathList(raw)).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("deduplicates", () => {
    expect(parsePathList("src/a.ts\nsrc/a.ts")).toEqual(["src/a.ts"]);
  });
});

describe("pickFilesByLuna", () => {
  const repoMap = ["src/a.ts", "src/b.ts", "src/c.ts"];

  it("keeps only paths that exist in repoMap", async () => {
    const { picked, needsFallback } = await pickFilesByLuna({
      ai: aiComplete("src/a.ts\nsrc/nope.ts\nsrc/b.ts"),
      repoMap,
      query: "fix",
    });
    expect(picked).toEqual(["src/a.ts", "src/b.ts"]);
    expect(needsFallback).toBe(false);
  });

  it("signals fallback when nothing valid came back", async () => {
    const { picked, needsFallback } = await pickFilesByLuna({
      ai: aiComplete("I cannot help with that."),
      repoMap,
      query: "fix",
    });
    expect(picked).toEqual([]);
    expect(needsFallback).toBe(true);
  });

  it("signals fallback when the model throws", async () => {
    const { needsFallback } = await pickFilesByLuna({
      ai: aiComplete(new Error("boom")),
      repoMap,
      query: "fix",
    });
    expect(needsFallback).toBe(true);
  });

  it("never exceeds the requested limit", async () => {
    const { picked } = await pickFilesByLuna({
      ai: aiComplete("src/a.ts\nsrc/b.ts\nsrc/c.ts"),
      repoMap,
      query: "fix",
      maxFiles: 2,
    });
    expect(picked).toHaveLength(2);
  });

  it("skips the call entirely for an empty repoMap or query", async () => {
    const ai = aiComplete("src/a.ts");
    expect((await pickFilesByLuna({ ai, repoMap: [], query: "x" })).needsFallback).toBe(true);
    expect((await pickFilesByLuna({ ai, repoMap, query: "  " })).needsFallback).toBe(true);
    expect(ai.complete).not.toHaveBeenCalled();
  });
});

const LOCAL = { url: "http://127.0.0.1:8000", model: "typed-decisions", fileSelection: true };

/** ローカル Laya の batch 応答を差し替える。legacy 経路の complete モックも保持する。 */
function stubLayaBatch(answers: unknown, status = 200): { calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(init?.body as string) });
      return new Response(JSON.stringify({ answers }), {
        status,
        headers: { "content-type": "application/json" },
      });
    })
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickFilesByLuna のローカル Laya 経路", () => {
  const repoMap = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"];

  it("POSTs /v1/systemone/batch with the candidate paths as states", async () => {
    const { calls } = stubLayaBatch([1, 0, 0, 0]);
    const ai = aiComplete("");
    const res = await pickFilesByLuna({ ai, repoMap, query: "fix", local: LOCAL });

    expect(calls[0].url).toBe("http://127.0.0.1:8000/v1/systemone/batch");
    const body = calls[0].body as { model: string; states: string[]; questions: Record<string, unknown> };
    expect(body.model).toBe("typed-decisions");
    expect(body.states).toEqual(repoMap);
    expect(body.questions.needed).toMatchObject({ type: "noul" });
    expect(res.picked).toEqual(["src/a.ts"]);
    expect(res.needsFallback).toBe(false);
    // ローカルで足りたらテキストモデルは呼ばない
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it("sorts by noul descending and applies the 0.5 threshold", async () => {
    // answers は states の順（a=0.9, b=0.1, c=0.8, d=0.6）
    stubLayaBatch([0.9, 0.1, 0.8, 0.6]);
    const res = await pickFilesByLuna({ ai: aiComplete(""), repoMap, query: "fix", local: LOCAL });

    expect(res.picked).toEqual(["src/a.ts", "src/c.ts", "src/d.ts"]);
  });

  it("caps the picked list at the limit", async () => {
    stubLayaBatch([0.9, 0.9, 0.9, 0.9]);
    const res = await pickFilesByLuna({ ai: aiComplete(""), repoMap, query: "fix", maxFiles: 2, local: LOCAL });
    expect(res.picked).toHaveLength(2);
  });

  it("caps the request batch at 64 candidates", async () => {
    const many = Array.from({ length: 80 }, (_, i) => `src/f${i}.ts`);
    const { calls } = stubLayaBatch(Array.from({ length: 64 }, () => 1));
    await pickFilesByLuna({ ai: aiComplete(""), repoMap: many, query: "fix", local: LOCAL });
    expect((calls[0].body as { states: string[] }).states).toHaveLength(64);
  });

  it("falls back to the text model when the batch endpoint 404s", async () => {
    stubLayaBatch({}, 404);
    const ai = aiComplete("src/b.ts");
    const res = await pickFilesByLuna({ ai, repoMap, query: "fix", local: LOCAL });
    expect(res.picked).toEqual(["src/b.ts"]);
    expect(res.needsFallback).toBe(false);
    expect(ai.complete).toHaveBeenCalled();
  });

  it("falls back when no candidate clears the threshold", async () => {
    stubLayaBatch([0, 0, 0, 0]);
    const ai = aiComplete("");

    const res = await pickFilesByLuna({ ai, repoMap, query: "fix", local: LOCAL });

    expect(res.picked).toEqual([]);
    expect(res.needsFallback).toBe(true);
    expect(ai.complete).toHaveBeenCalled();
  });

  it("falls back when the local request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );
    const ai = aiComplete("");
    expect((await pickFilesByLuna({ ai, repoMap, query: "fix", local: LOCAL })).needsFallback).toBe(
      true
    );
  });

  it("skips the local path when fileSelection is false", async () => {
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const ai = aiComplete("src/a.ts");
      const res = await pickFilesByLuna({
        ai,
        repoMap,
        query: "fix",
        local: { ...LOCAL, fileSelection: false },
      });
      expect(res.picked).toEqual(["src/a.ts"]);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("uses the legacy text path when no local config is given", async () => {
    const ai = aiComplete("src/a.ts");
    const res = await pickFilesByLuna({ ai, repoMap, query: "fix" });
    expect(res.picked).toEqual(["src/a.ts"]);
  });
});

describe("rankChunks", () => {
  const files = [
    { path: "src/a.ts", content: "export function alpha() { return 1; }" },
    { path: "src/b.ts", content: "export function beta() { return 2; }" },
  ];

  it("returns nothing when the provider cannot embed", async () => {
    expect(await rankChunks({ ai: aiComplete(""), query: "q", files, topK: 5 })).toEqual([]);
  });

  it("orders by cosine similarity", async () => {
    // alpha のテキストをクエリと完全一致させる
    const ai = {
      name: "mock",
      complete: vi.fn(),
      embed: async (texts: string[]) => texts.map((t) => (t.includes("alpha") ? [1, 0] : [0, 1])),
    } as unknown as AiProvider;
    const out = await rankChunks({ ai, query: "alpha", files, topK: 5 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].file).toBe("src/a.ts");
    expect(out[0].score).toBeCloseTo(1);
    expect(out[0].symbol).toBe("alpha");
  });

  it("returns nothing when embedding fails", async () => {
    const ai = {
      name: "mock",
      complete: vi.fn(),
      embed: vi.fn().mockRejectedValue(new Error("down")),
    } as unknown as AiProvider;
    expect(await rankChunks({ ai, query: "q", files, topK: 5 })).toEqual([]);
  });

  it("respects topK", async () => {
    const ai = {
      name: "mock",
      complete: vi.fn(),
      embed: async (texts: string[]) => texts.map(() => [1, 0]),
    } as unknown as AiProvider;
    expect(await rankChunks({ ai, query: "q", files, topK: 1 })).toHaveLength(1);
  });
});

describe("tokenize", () => {
  it("keeps ASCII identifiers", () => {
    expect(tokenize("healing runner")).toContain("healing");
    expect(tokenize("healing runner")).toContain("runner");
  });

  it("segments Japanese words", () => {
    const tokens = tokenize("認証エラー処理");
    expect(tokens.some((t) => /[^\x00-\x7f]/.test(t))).toBe(true);
  });

  it("drops single characters and returns unique tokens", () => {
    const tokens = tokenize("a healing healing");
    expect(tokens).toContain("healing");
    expect(tokens.filter((t) => t === "healing")).toHaveLength(1);
    expect(tokens).not.toContain("a");
  });

  it("returns an empty list for punctuation-only input", () => {
    expect(tokenize("!!! /// ...")).toEqual([]);
  });
});
