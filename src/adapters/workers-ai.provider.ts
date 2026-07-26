import { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "../config/deployment";
import type { AiProvider, AiCompletionRequest, AiModelInfo } from "../ports";

const AI_TIMEOUT_MS = 120_000;

/** カタログに出ないパートナーモデル（minimax 等）を datalist に載せる。 */
const PARTNER_MODELS: AiModelInfo[] = [
  {
    value: DEFAULT_WORKERS_AI_MODEL,
    label: "MiniMax M3 (partner)",
    provider: "workers-ai",
    task: "Text Generation",
  },
];

export interface WorkersAiProviderOptions {
  /** Default model when a request does not override it. */
  model?: string;
  /**
   * Cloudflare API token scoped to Workers AI (secret WORKERS_AI_API_TOKEN).
   * When set together with accountId, inference goes through the Workers AI
   * REST API first; on 401/403 falls back to the AI binding.
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
    const model = req.model && isWorkersAiModelId(req.model) ? req.model : this.model;
    const messages = [
      { role: "system" as const, content: req.system },
      { role: "user" as const, content: req.prompt },
    ];
    const maxTokens = req.maxTokens ?? 4096;

    if (this.opts.apiToken && this.opts.accountId) {
      try {
        return await this.completeViaRest(model, messages, maxTokens);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // トークン腐敗時はバインディングへフォールバック
        if (/\b401\b|\b403\b|Invalid User Credentials|2021/.test(msg)) {
          console.warn("[workers-ai] REST auth failed, falling back to AI binding:", msg.slice(0, 200));
          return this.completeViaBinding(model, messages, maxTokens);
        }
        throw err;
      }
    }
    return this.completeViaBinding(model, messages, maxTokens);
  }

  private async completeViaBinding(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number
  ): Promise<string> {
    const payload = { messages, max_tokens: maxTokens };
    const run = this.ai.run(model as keyof AiModels, payload as never) as Promise<{ response?: string }>;
    const result = await withTimeout(run, AI_TIMEOUT_MS, `Workers AI binding timed out after ${AI_TIMEOUT_MS}ms`);
    return result?.response ?? "";
  }

  /**
   * OpenAI 互換エンドポイント `/ai/v1/chat/completions`。
   * パートナーモデル（minimax/m3 等）は旧 `/ai/run/<model>` では動かない。
   */
  private async completeViaRest(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number
  ): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Workers AI REST request failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      result?: { response?: string };
    };
    // OpenAI 互換形を優先、旧形もフォールバック
    return data.choices?.[0]?.message?.content ?? data.result?.response ?? "";
  }

  /**
   * テキスト埋め込み。VECTORIZE インデックス（768 次元）と揃えるため
   * モデルは bge-base-en-v1.5 固定。バッチ上限 100 件ずつ分割して呼び出す。
   * 埋め込みはバインディング優先（REST の外部 subrequest 枠を消費しない）。
   */
  async embed(texts: string[]): Promise<number[][]> {
    const model = "@cf/baai/bge-base-en-v1.5";
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 100) {
      const batch = texts.slice(i, i + 100);
      const run = this.ai.run(model as keyof AiModels, { text: batch } as never) as Promise<{
        data?: number[][];
      }>;
      const result = await withTimeout(run, AI_TIMEOUT_MS, "Workers AI embedding timed out");
      const data = result?.data;
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
    // パートナーモデルを先頭にマージ（カタログに含まれないことがある）
    const merged = [
      ...PARTNER_MODELS.filter((p) => !models.some((m) => m.value === p.value)).map((p) => ({
        ...p,
        provider: this.name,
      })),
      ...models,
    ];
    return merged;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
