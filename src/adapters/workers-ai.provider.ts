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

  /**
   * テキスト埋め込み。VECTORIZE インデックス（768 次元）と揃えるため
   * モデルは bge-base-en-v1.5 固定。バッチ上限 100 件ずつ分割して呼び出す。
   */
  async embed(texts: string[]): Promise<number[][]> {
    const model = "@cf/baai/bge-base-en-v1.5";
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      let data: number[][] | undefined;
      if (this.opts.apiToken && this.opts.accountId) {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/run/${model}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.opts.apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ text: batch }),
        });
        if (!res.ok) {
          throw new Error(`Workers AI embedding request failed: ${res.status} ${await res.text()}`);
        }
        const json = (await res.json()) as { result?: { data?: number[][] } };
        data = json.result?.data;
      } else {
        const result = (await this.ai.run(model as keyof AiModels, { text: batch } as never)) as {
          data?: number[][];
        };
        data = result?.data;
      }
      if (!data || data.length !== batch.length) {
        throw new Error("Workers AI embedding returned unexpected shape");
      }
      out.push(...data);
    }
    return out;
  }

  /** Enumerate the text-generation models the Workers AI binding serves (paged). */
  async listModels(): Promise<AiModelInfo[]> {
    const models: AiModelInfo[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.ai.models({ per_page: perPage, page });
      for (const m of batch) {
        // 埋め込み/画像等を除外し、Text Generation モデルのみを返す
        const task = m.task?.name ?? "";
        if (task && task !== "Text Generation") continue;
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
