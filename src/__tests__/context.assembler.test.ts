import { describe, it, expect, vi } from "vitest";
import { assembleContext } from "../code/context.assembler";
import type { AiProvider } from "../ports";
import type { CodeSnippet } from "../retrieval/chunk.rank";

/** Luna がファイルを列挙し、embedding は identiy を返すだけのモック。 */
function mockAi(opts: { picked?: string[]; vectors?: (t: string) => number[] } = {}): AiProvider {
  const picked = opts.picked ?? [];
  return {
    name: "mock",
    complete: vi.fn(async () => picked.join("\n")),
    embed: opts.vectors
      ? (async (texts: string[]) => texts.map((t) => opts.vectors!(t)))
      : undefined,
  } as unknown as AiProvider;
}

const snippet = (file: string, score: number, startLine = 1): CodeSnippet => ({
  file,
  startLine,
  endLine: startLine + 10,
  text: `code in ${file}`,
  score,
  lang: "typescript",
  kind: "fn",
  symbol: "x",
});

describe("assembleContext", () => {
  it("falls back to path tokens when Luna returns nothing", async () => {
    const assembled = await assembleContext({
      query: "update session manager",
      ai: mockAi({ picked: [] }),
      files: [
        { path: "src/code/session.manager.ts", content: "export class CodeSessionManager {}" },
        { path: "README.md", content: "# hi" },
      ],
      maxFiles: 2,
    });
    expect(assembled.source).toBe("path");
    expect(assembled.selectedPaths[0]).toBe("src/code/session.manager.ts");
    expect(assembled.files[0]?.path).toBe("src/code/session.manager.ts");
  });

  it("uses Luna's pick when available", async () => {
    const assembled = await assembleContext({
      query: "login",
      ai: mockAi({ picked: ["src/auth.ts"] }),
      files: [
        { path: "src/auth.ts", content: "export function login() {}" },
        { path: "src/other.ts", content: "1" },
      ],
      maxFiles: 1,
    });
    expect(assembled.source).toBe("luna");
    expect(assembled.selectedPaths).toEqual(["src/auth.ts"]);
    expect(assembled.pickedPaths).toEqual(["src/auth.ts"]);
  });

  it("drops paths Luna invented that are not in the file list", async () => {
    const ai = mockAi({ picked: ["src/does-not-exist.ts", "src/auth.ts"] });
    const assembled = await assembleContext({
      query: "login",
      ai,
      files: [{ path: "src/auth.ts", content: "export function login() {}" }],
      maxFiles: 4,
    });
    expect(assembled.pickedPaths).toEqual(["src/auth.ts"]);
  });

  it("respects the character budget", async () => {
    const assembled = await assembleContext({
      query: "a",
      ai: mockAi({ picked: ["a.ts", "b.ts"] }),
      files: [
        { path: "a.ts", content: "AAAA" },
        { path: "b.ts", content: "BBBB" },
      ],
      maxFiles: 8,
      maxChars: 4,
    });
    expect(assembled.files).toHaveLength(1);
    expect(assembled.files[0]?.content).toBe("AAAA");
  });

  it("returns nothing when the file list is empty", async () => {
    const assembled = await assembleContext({
      query: "login",
      ai: mockAi({ picked: ["src/auth.ts"] }),
      files: [],
      maxFiles: 4,
    });
    expect(assembled.files).toEqual([]);
    expect(assembled.source).toBe("fallback");
  });
});

describe("scorePathsByTokens", () => {
  it("keeps ASCII identifiers", async () => {
    const { scorePathsByTokens } = await import("../retrieval/retrieve");
    const out = scorePathsByTokens(
      ["src/healing/repo.runner.ts", "src/ui/pages/settings.tsx"],
      "healing の処理を直して",
      5
    );
    expect(out[0]).toBe("src/healing/repo.runner.ts");
  });

  it("segments Japanese so it can match Japanese paths", async () => {
    const { scorePathsByTokens } = await import("../retrieval/retrieve");
    const out = scorePathsByTokens(
      ["src/認証/処理.ts", "src/ui/pages/settings.tsx"],
      "認証処理を直して",
      5
    );
    expect(out[0]).toBe("src/認証/処理.ts");
  });

  it("snippet shape matches the ranker output", () => {
    expect(snippet("src/a.ts", 0.5).kind).toBe("fn");
  });
});
