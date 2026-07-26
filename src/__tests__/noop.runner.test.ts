import { describe, it, expect } from "vitest";
import { NoopRunner } from "../ports/runner";

describe("NoopRunner", () => {
  it("scan returns empty findings", async () => {
    const runner = new NoopRunner();
    const r = await runner.scan();
    expect(r.findings.commitHash).toBe("");
  });
});
