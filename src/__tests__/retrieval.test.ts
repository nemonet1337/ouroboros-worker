import { describe, it, expect, vi } from "vitest";
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
