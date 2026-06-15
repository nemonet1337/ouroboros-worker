import { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "../config/deployment";
import type { AiProvider, AiCompletionRequest, AiModelInfo } from "../ports";

export interface WorkersAiProviderOptions {
  /** Default model when a request does not override it. */
  model?: string;
  /**
   * Cloudflare API token scoped to Workers AI (secret WORKERS_AI_API_TOKEN).
   * When set together with accountId, inference goes through the Workers AI
   * REST API; otherwise the in-Worker AI binding is used.
   */
  apiToken?: string;
  accountId?: string;
}

/**
 * AiProvider backed by Cloudflare Workers AI — the ONLY AI gateway Ouroboros
 * connects to. There is deliberately no fallback to external APIs (Anthropic,
 * OpenAI, ...). Every model served by the AI binding is discoverable via
 * listModels() and selectable from the GUI settings screen.
 */
export class WorkersAiProvider implements AiProvider {
  readonly name = "workers-ai";
  private readonly model: string;

  constructor(
    private readonly ai: Ai,
    private readonly opts: WorkersAiProviderOptions = {}
  ) {
    this.model = opts.model || DEFAULT_WORKERS_AI_MODEL;
  }

  async complete(req: AiCompletionRequest): Promise<string> {
    // Only honour per-request model overrides that are Workers AI ids
    // ("@cf/...", "@hf/...", "vendor/model"); anything else falls back to the
    // configured default.
    const model = req.model && isWorkersAiModelId(req.model) ? req.model : this.model;
    const payload = {
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxTokens ?? 4096,
    };

    if (this.opts.apiToken && this.opts.accountId) {
      return this.completeViaRest(model, payload);
    }
    const result = (await this.ai.run(model as keyof AiModels, payload as never)) as {
      response?: string;
    };
    return result?.response ?? "";
  }

  /** Workers AI REST API path, authenticated with WORKERS_AI_API_TOKEN. */
  private async completeViaRest(model: string, payload: unknown): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/run/${model}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Workers AI REST request failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { result?: { response?: string } };
    return data.result?.response ?? "";
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
