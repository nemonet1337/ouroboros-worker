import { describe, it, expect } from "vitest";
import { parseGeneratedPatches } from "../healing/repo.runner";

describe("parseGeneratedPatches", () => {
  it("parses a {patches} object", () => {
    const { patches, error } = parseGeneratedPatches(
      JSON.stringify({ patches: [{ file: "a.ts", explanation: "x" }] })
    );
    expect(error).toBeUndefined();
    expect(patches).toEqual([{ file: "a.ts", explanation: "x" }]);
  });

  it("parses a top-level array", () => {
    const { patches, error } = parseGeneratedPatches(JSON.stringify([{ file: "b.ts" }]));
    expect(error).toBeUndefined();
    expect(patches[0]?.file).toBe("b.ts");
  });

  it("strips markdown fences", () => {
    const { patches, error } = parseGeneratedPatches(
      "```json\n{\"patches\":[{\"file\":\"c.ts\"}]}\n```"
    );
    expect(error).toBeUndefined();
    expect(patches[0]?.file).toBe("c.ts");
  });

  it("extracts JSON after a reasoning preamble", () => {
    const { patches, error } = parseGeneratedPatches(
      "Sure, here is the change:\n{\"patches\":[{\"file\":\"d.ts\"}]}\n"
    );
    expect(error).toBeUndefined();
    expect(patches[0]?.file).toBe("d.ts");
  });

  it("returns an error when JSON is missing patches", () => {
    const { patches, error } = parseGeneratedPatches("{\"ok\":true}");
    expect(patches).toEqual([]);
    expect(error).toContain("patches");
  });
});
