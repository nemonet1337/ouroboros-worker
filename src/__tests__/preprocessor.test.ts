import { describe, it, expect } from "vitest";
import { preprocessFiles, computeContentHash } from "../inspection/preprocessor";
import { InspectionFile } from "../types";

function makeFile(path: string, lines: number): InspectionFile {
  const content = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join("\n");
  return { path, content };
}

describe("preprocessFiles", () => {
  it("passes small files through unchanged", () => {
    const file = makeFile("src/a.ts", 10);
    const result = preprocessFiles([file], 50_000);
    expect(result[0].content).toBe(file.content);
  });

  it("truncates files that exceed the byte limit", () => {
    const large = makeFile("src/large.ts", 1000);
    const maxBytes = Buffer.byteLength(
      Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n"),
      "utf8"
    );
    const result = preprocessFiles([large], maxBytes);
    expect(result[0].content).toContain("TRUNCATED");
    expect(result[0].content.split("\n").length).toBeLessThan(1000);
  });

  it("preserves path when truncating", () => {
    const large = makeFile("src/big.go", 1000);
    const result = preprocessFiles([large], 10);
    expect(result[0].path).toBe("src/big.go");
  });

  it("returns all files in original order", () => {
    const files = [makeFile("a.ts", 1), makeFile("b.ts", 1), makeFile("c.ts", 1)];
    const result = preprocessFiles(files, 50_000);
    expect(result.map((f) => f.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });
});

describe("computeContentHash", () => {
  it("produces a sha256: prefixed string", () => {
    const hash = computeContentHash([makeFile("a.ts", 5)]);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("returns the same hash for identical input", () => {
    const files = [makeFile("a.ts", 5)];
    expect(computeContentHash(files)).toBe(computeContentHash(files));
  });

  it("returns different hashes when content changes", () => {
    const f1 = [{ path: "a.ts", content: "hello" }];
    const f2 = [{ path: "a.ts", content: "world" }];
    expect(computeContentHash(f1)).not.toBe(computeContentHash(f2));
  });

  it("returns different hashes when path changes", () => {
    const f1 = [{ path: "a.ts", content: "same" }];
    const f2 = [{ path: "b.ts", content: "same" }];
    expect(computeContentHash(f1)).not.toBe(computeContentHash(f2));
  });
});
