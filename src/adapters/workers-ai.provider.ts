import { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "../config/deployment";
import type { AiProvider, AiCompletionRequest, AiModelInfo } from "../ports";

const AI_TIMEOUT_MS = 120_000;
const MODELS_TTL_MS = 60 * 60 * 1000;

/** カタログに出ない／出にくいモデルを datalist に載せる。 */
const PARTNER_MODELS: AiModelInfo[] = [
  {
    value: DEFAULT_WORKERS_AI_MODEL,
    label: "GLM-5.3 Flash (Z.ai)",
    provider: "workers-ai",
    task: "Text Generation",
  },
  {
    value: "minimax/m3",
    label: "MiniMax M3 (partner)",
    provider: "workers-ai",
    task: "Text Generation",
  },
];

/** Binding / REST 双方の応答から本文を取る（旧 `{response}` と OpenAI `choices` 形）。 */
export function extractCompletionText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const obj = result as {
    response?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
    result?: { response?: unknown };
  };
  const fromChoice = obj.choices?.[0]?.message?.content;
  if (typeof fromChoice === "string" && fromChoice.length > 0) return fromChoice;
  if (typeof obj.response === "string" && obj.response.length > 0) return obj.response;
  if (typeof obj.result?.response === "string") return obj.result.response;
  return "";
}

function extractUsage(result: unknown): { promptTokens: number; completionTokens: number } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (!usage) return undefined;
  return {
    promptTokens: Number(usage.prompt_tokens ?? 0),
    completionTokens: Number(usage.completion_tokens ?? 0),
  };
}

export interface AiUsageEvent {
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface WorkersAiProviderOptions {
  model?: string;
  apiToken?: string;
  accountId?: string;
  onUsage?: (event: AiUsageEvent) => void;
}

/**
 * Workers AI binding が既定。パートナーモデル（`vendor/model`、`@` なし）だけ
 * REST `/ai/v1/chat/completions` を試す。REST が 401/403 なら isolate 内では再試行しない。
 */
export class WorkersAiProvider implements AiProvider {
  readonly name = "workers-ai";
  private readonly model: string;
  /** isolate 寿命。トークン腐敗時に毎 complete で REST を踏まない。 */
  #restAuthFailed = false;
  #modelsCache: { at: number; models: AiModelInfo[] } | undefined;

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
    const started = Date.now();

    const useRest =
      !this.#restAuthFailed &&
      !!this.opts.apiToken &&
      !!this.opts.accountId &&
      isPartnerModelId(model);

    let text: string;
    let usage: { promptTokens: number; completionTokens: number } | undefined;
    if (useRest) {
      try {
        const rest = await this.completeViaRest(model, messages, maxTokens);
        text = rest.text;
        usage = rest.usage;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/\b401\b|\b403\b|Invalid User Credentials|2021/.test(msg)) {
          this.#restAuthFailed = true;
          console.warn("[workers-ai] REST auth failed, binding only for this isolate:", msg.slice(0, 200));
          const bound = await this.completeViaBinding(model, messages, maxTokens);
          text = bound.text;
          usage = bound.usage;
        } else {
          throw err;
        }
      }
    } else {
      const bound = await this.completeViaBinding(model, messages, maxTokens);
      text = bound.text;
      usage = bound.usage;
    }

    this.opts.onUsage?.({
      model,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      durationMs: Date.now() - started,
    });
    return text;
  }

  private async completeViaBinding(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number
  ): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
    const payload = { messages, max_tokens: maxTokens };
    const run = this.ai.run(model as keyof AiModels, payload as never) as Promise<unknown>;
    const result = await withTimeout(run, AI_TIMEOUT_MS, `Workers AI binding timed out after ${AI_TIMEOUT_MS}ms`);
    return { text: extractCompletionText(result), usage: extractUsage(result) };
  }

  /**
   * パートナーモデル用。`@cf/...` カタログモデルは binding の方が subrequest を食わない。
   */
  private async completeViaRest(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number
  ): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }> {
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
    const json: unknown = await res.json();
    return { text: extractCompletionText(json), usage: extractUsage(json) };
  }

  /**
   * テキスト埋め込み。VECTORIZE インデックス（768 次元）と揃えるため
   * モデルは bge-base-en-v1.5 固定。バッチ上限 100 件ずつ。binding のみ。
   */
  async embed(texts: string[]): Promise<number[][]> {
    const model = "@cf/baai/bge-base-en-v1.5";
    const out: number[][] = [];
    const started = Date.now();
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
    this.opts.onUsage?.({
      model,
      promptTokens: texts.reduce((n, t) => n + t.length, 0),
      completionTokens: 0,
      durationMs: Date.now() - started,
    });
    return out;
  }

  async listModels(): Promise<AiModelInfo[]> {
    const now = Date.now();
    if (this.#modelsCache && now - this.#modelsCache.at < MODELS_TTL_MS) {
      return this.#modelsCache.models;
    }
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
    const merged = [
      ...PARTNER_MODELS.filter((p) => !models.some((m) => m.value === p.value)).map((p) => ({
        ...p,
        provider: this.name,
      })),
      ...models,
    ];
    this.#modelsCache = { at: now, models: merged };
    return merged;
  }
}

/** `@cf/...` カタログ以外（`minimax/m3` 等）は REST が必要なことがある。 */
export function isPartnerModelId(id: string): boolean {
  return !id.startsWith("@") && id.includes("/");
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
