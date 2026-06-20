import type { AiProvider } from "../ports/ai";
import type { CodeRunner } from "../ports/runner";
import type { Patch } from "../types";
import { buildCodeGenPrompt } from "./prompt.templates";

export interface CodeAgentOptions {
  ai: AiProvider;
  runner: CodeRunner;
}

export class CodeAgent {
  constructor(private readonly opts: CodeAgentOptions) {}

  async generate(opts: {
    instruction: string;
    sessionId: string;
    model?: string;
  }): Promise<{ patches: Patch[]; model: string }> {
    const { instruction, sessionId } = opts;
    const model = opts.model ?? "moonshotai/kimi-k2";

    const { system, user } = buildCodeGenPrompt({ instruction });

    const completion = await this.opts.ai.complete({
      system: system,
      prompt: user,
      maxTokens: 4096,
    });

    const raw = completion.trim();
    let patches: Patch[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.patches)) patches = parsed.patches as Patch[];
      else if (Array.isArray(parsed)) patches = parsed as Patch[];
    } catch {
      patches = [];
    }

    return { patches, model };
  }
}
