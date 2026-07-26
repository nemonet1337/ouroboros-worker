import { describe, it, expect } from "vitest";
import { NoopRunner } from "../ports/runner";

describe("NoopRunner (replaces RpcRunner)", () => {
  it("returns empty findings from scan", async () => {
    const runner = new NoopRunner();
    const r = await runner.scan();
    expect(r.findings.staticAnalysis).toEqual([]);
  });
});
