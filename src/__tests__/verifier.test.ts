import { describe, it, expect } from "vitest";
import { verifyPatches, verifyFix, isBalanced } from "../code/verifier";

describe("verifyPatches", () => {
  const files = [{ path: "src/a.ts", content: "const a = 1;\n" }];

  it("rejects originalContent that does not match the file", () => {
    const result = verifyPatches(
      [
        {
          file: "src/a.ts",
          originalContent: "wrong",
          fixedContent: "const a = 2;\n",
          diff: "",
          explanation: "x",
        },
      ],
      files
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("originalContent"))).toBe(true);
  });

  it("accepts a matching existing-file patch", () => {
    const result = verifyPatches(
      [
        {
          file: "src/a.ts",
          originalContent: "const a = 1;\n",
          fixedContent: "const a = 2;\n",
          diff: "",
          explanation: "x",
        },
      ],
      files
    );
    expect(result.ok).toBe(true);
  });

  it("allows new files with empty originalContent", () => {
    const result = verifyPatches(
      [
        {
          file: "src/new.ts",
          originalContent: "",
          fixedContent: "export const n = 1;\n",
          diff: "",
          explanation: "new",
        },
      ],
      files,
      ["src/a.ts"]
    );
    expect(result.ok).toBe(true);
  });

  it("rejects dangerous paths", () => {
    const result = verifyPatches(
      [
        {
          file: ".env",
          originalContent: "",
          fixedContent: "SECRET=1",
          diff: "",
          explanation: "no",
        },
      ],
      []
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/秘密/);
  });

  it("rejects unbalanced braces", () => {
    const result = verifyPatches(
      [
        {
          file: "src/a.ts",
          originalContent: "const a = 1;\n",
          fixedContent: "function x() {",
          diff: "",
          explanation: "x",
        },
      ],
      files
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("括弧"))).toBe(true);
  });
});

describe("isBalanced / verifyFix", () => {
  it("treats strings as non-code", () => {
    expect(isBalanced(`const s = "{";`)).toBe(true);
  });

  it("flags empty replacements", () => {
    const result = verifyFix("   ");
    expect(result.ok).toBe(false);
  });
});
