import type { AiProvider, AiCompletionRequest } from "../ports/ai";

/** Deterministic AI provider stub for tests. */
export function mockAi(response = ""): AiProvider {
  return {
    name: "mock",
    async complete(_req: AiCompletionRequest): Promise<string> {
      return response;
    },
  };
}
