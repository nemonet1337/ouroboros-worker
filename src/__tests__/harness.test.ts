import { describe, it, expect, vi } from "vitest";
import { runHarness } from "../code/harness";
import type { AssembledContext } from "../code/context.assembler";
import type { AiProvider } from "../ports/ai";

const assembled: AssembledContext = {
  query: "increment",
  snippets: [],
  files: [{ path: "src/a.ts", content: "const a = 1;\n" }],
  repoMap: ["src/a.ts"],
  selectedPaths: ["src/a.ts"],
  source: "path",
};

const good = JSON.stringify({
  patches: [
    {
      file: "src/a.ts",
      originalContent: "const a = 1;\n",
      fixedContent: "const a = 2;\n",
      diff: "",
      explanation: "inc",
    },
  ],
});

const bad = JSON.stringify({
  patches: [
    {
      file: "src/a.ts",
      originalContent: "WRONG",
      fixedContent: "const a = 2;\n",
      diff: "",
      explanation: "inc",
    },
  ],
});

describe("runHarness", () => {
  it("repairs once when verification fails then succeeds", async () => {
    const complete = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const ai = { name: "mock", complete } as unknown as AiProvider;
    const result = await runHarness({
      instruction: "increment a",
      model: "m",
      ai,
      assembled,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.patches[0]?.fixedContent).toBe("const a = 2;\n");
    expect(result.trace.repairAttempts).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("returns patches with trace warnings when repair still fails", async () => {
    const complete = vi.fn().mockResolvedValue(bad);
    const ai = { name: "mock", complete } as unknown as AiProvider;
    const result = await runHarness({
      instruction: "increment a",
      model: "m",
      ai,
      assembled,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.patches).toHaveLength(1);
    expect(result.trace.verifyErrors.some((e) => e.includes("originalContent"))).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
