import { describe, it, expect } from "vitest";
import { CodeAgent } from "../code/agent";
import { mockAi } from "./helpers";
import { NoopRunner } from "../ports/runner";

describe("CodeAgent", () => {
  it("should parse patches from valid JSON response", async () => {
    const aiResponse = JSON.stringify({
      patches: [
        {
          file: "src/index.ts",
          fixedContent: "console.log('hello');",
        },
      ],
    });
    const agent = new CodeAgent({
      ai: mockAi(aiResponse),
      runner: new NoopRunner(),
    });

    const result = await agent.generate({
      instruction: "fix print",
      sessionId: "session-123",
    });

    expect(result.patches).toHaveLength(1);
    expect(result.patches[0].file).toBe("src/index.ts");
    expect(result.patches[0].fixedContent).toBe("console.log('hello');");
  });

  it("should return empty patches on malformed JSON response", async () => {
    const agent = new CodeAgent({
      ai: mockAi("invalid json"),
      runner: new NoopRunner(),
    });

    const result = await agent.generate({
      instruction: "fix print",
      sessionId: "session-123",
    });

    expect(result.patches).toEqual([]);
  });
});
