import type { AiProvider, AiCompletionRequest, AiModelInfo } from "@ouroboros/core";

const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/**
 * AiProvider backed by Cloudflare Workers AI (native edge LLM). On the
 * Cloudflare deploy target this is the ONLY AI gateway — there is deliberately
 * no fallback to external APIs (Anthropic, OpenAI, ...). Every model served by
 * the AI binding is discoverable via listModels().
 */
export class WorkersAiProvider implements AiProvider {
  readonly name = "workers-ai";

  constructor(
    private readonly ai: Ai,
    private readonly model: string = DEFAULT_WORKERS_AI_MODEL
  ) {}

  async complete(req: AiCompletionRequest): Promise<string> {
    // Only honour per-request model overrides that are Workers AI ids
    // ("@cf/...", "@hf/..."); external model names fall back to the default.
    const model = req.model?.startsWith("@") ? req.model : this.model;
    const result = (await this.ai.run(model as keyof AiModels, {
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
    } as never)) as { response?: string };
    return result?.response ?? "";
  }

  /** Enumerate every model the Workers AI binding serves (paged). */
  async listModels(): Promise<AiModelInfo[]> {
    const models: AiModelInfo[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.ai.models({ per_page: perPage, page });
      for (const m of batch) {
        models.push({
          value: m.name,
          label: m.name.replace(/^@[^/]+\//, ""),
          provider: this.name,
          task: m.task?.name,
          description: m.description,
        });
      }
      if (batch.length < perPage) break;
    }
    return models;
  }
}
