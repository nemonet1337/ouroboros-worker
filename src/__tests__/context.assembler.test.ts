import { describe, it, expect } from "vitest";
import { assembleContext, selectPaths } from "../code/context.assembler";
import type { CodeIndexer, CodeSnippet } from "../vectorize/code.indexer";

const snippet = (file: string, score: number, startLine = 1): CodeSnippet => ({
  file,
  startLine,
  endLine: startLine + 10,
  text: `code in ${file}`,
  score,
});

describe("selectPaths", () => {
  it("always includes targetPaths first", () => {
    const paths = selectPaths({
      snippets: [snippet("src/hit.ts", 0.9)],
      fileList: ["src/hit.ts", "src/must.ts"],
      query: "fix auth",
      targetPaths: ["src/must.ts"],
      maxFiles: 2,
    });
    expect(paths[0]).toBe("src/must.ts");
    expect(paths).toContain("src/hit.ts");
  });

  it("diversifies to unique files and prefers higher scores", () => {
    const paths = selectPaths({
      snippets: [snippet("src/a.ts", 0.5), snippet("src/a.ts", 0.4, 40), snippet("src/b.ts", 0.9)],
      fileList: ["src/a.ts", "src/b.ts"],
      query: "x",
      maxFiles: 2,
    });
    expect(paths[0]).toBe("src/b.ts");
    expect(paths).toContain("src/a.ts");
  });

  it("adds a neighbor test file when present", () => {
    const paths = selectPaths({
      snippets: [snippet("src/foo.ts", 0.9)],
      fileList: ["src/foo.ts", "src/foo.test.ts", "src/other.ts"],
      query: "foo",
      maxFiles: 3,
    });
    expect(paths).toContain("src/foo.test.ts");
  });
});

describe("assembleContext", () => {
  it("falls back to path tokens when Vectorize is missing", async () => {
    const assembled = await assembleContext({
      query: "update session manager",
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

  it("uses Vectorize hits when the indexer returns snippets", async () => {
    const indexer = {
      search: async () => [snippet("src/auth.ts", 0.95)],
    } as unknown as CodeIndexer;
    const assembled = await assembleContext({
      query: "login",
      indexer,
      files: [
        { path: "src/auth.ts", content: "export function login() {}" },
        { path: "src/other.ts", content: "1" },
      ],
      maxFiles: 1,
    });
    expect(assembled.source).toBe("vectorize");
    expect(assembled.selectedPaths).toEqual(["src/auth.ts"]);
    expect(assembled.snippets[0]?.file).toBe("src/auth.ts");
  });

  it("respects the character budget", async () => {
    const assembled = await assembleContext({
      query: "a",
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
});
