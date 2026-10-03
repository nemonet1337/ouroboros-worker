import { describe, it, expect } from "vitest";
import { chunkFile, chunkId } from "../retrieval/chunker";

describe("chunkFile", () => {
  it("splits TypeScript on function/class/interface boundaries", () => {
    const content = [
      'import { x } from "./x";',
      "",
      "export function foo() {",
      "  return 1;",
      "}",
      "",
      "export class Bar {",
      "  baz() {}",
      "}",
      "",
      "export interface Qux {",
      "  a: number;",
      "}",
    ].join("\n");

    const chunks = chunkFile({ path: "src/a.ts", content });
    const kinds = chunks.map((c) => c.kind);
    expect(kinds).toContain("other");
    expect(kinds).toContain("fn");
    expect(kinds).toContain("class");
    expect(kinds).toContain("type");
    expect(chunks.find((c) => c.kind === "fn")?.symbol).toBe("foo");
    expect(chunks.find((c) => c.kind === "class")?.symbol).toBe("Bar");
  });

  it("falls back to line windows when there are no symbols", () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
    const chunks = chunkFile({ path: "notes.txt", content: lines.join("\n") });
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 50, kind: "other" });
    expect(chunks[1]).toMatchObject({ startLine: 41, endLine: 90 });
    expect(chunks[2]).toMatchObject({ startLine: 81, endLine: 120 });
  });

  it("marks test files as kind=test", () => {
    const chunks = chunkFile({
      path: "src/a.test.ts",
      content: "export function foo() { return 1; }\n",
    });
    expect(chunks.every((c) => c.kind === "test")).toBe(true);
  });

  it("marks config files as kind=config", () => {
    const chunks = chunkFile({ path: "package.json", content: '{ "name": "x" }\n' });
    expect(chunks[0]?.kind).toBe("config");
  });

  it("is stable for the same input", () => {
    const file = { path: "src/a.ts", content: "export function foo() {}\n" };
    expect(chunkFile(file)[0].id).toBe(chunkFile(file)[0].id);
    expect(chunkId("src/a.ts", 1, "fn")).toBe(chunkId("src/a.ts", 1, "fn"));
  });
});
