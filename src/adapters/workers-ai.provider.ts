import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  EMBED_BATCH_LIMIT,
  isDecisionModel,
  isEmbeddingTask,
  isTextGenerationTask,
  isWorkersAiModelId,
} from "../config/deployment";
import { DEFAULT_ROUTING_CONFIG } from "../config/routing";
import type {
  AiProvider,
  AiCompletionRequest,
  AiDecisionRequest,
  AiDecisionResult,
  AiModelInfo,
  AiModelPrice,
} from "../ports";

const AI_TIMEOUT_MS = 120_000;
const MODELS_TTL_MS = 60 * 60 * 1000;

/** カタログに出ない／出にくいモデルを datalist に載せる。 */
const PARTNER_MODELS: AiModelInfo[] = [
  {
    value: "openai/gpt-6-luna",
    label: "GPT-6 Luna (OpenAI)",
    provider: "workers-ai",
    task: "Text Generation",
    description: "効率系。集中的な大量処理向け。",
    contextWindow: 1_050_000,
  },
  {
    value: "openai/gpt-6-sol",
    label: "GPT-6 Sol (OpenAI)",
    provider: "workers-ai",
    task: "Text Generation",
    description: "性能系。複雑なコーディングと推論向け。",
    contextWindow: 1_050_000,
  },
  {
    value: "minimax/m3",
    label: "MiniMax M3 (partner)",
    provider: "workers-ai",
    task: "Text Generation",
  },
  {
    value: DEFAULT_EMBEDDING_MODEL,
    label: "Qwen3 Embedding 0.6B",
    provider: "workers-ai",
    task: "Text Embeddings",
    outputDimensions: 1024,
  },
];

interface CatalogProperty {
  property_id?: string;
  value?: unknown;
}

interface CatalogModel {
  name?: string;
  description?: string;
  task?: { name?: string } | string;
  properties?: CatalogProperty[];
}

/** Workers AI カタログ 1 件を GUI 用に正規化する。name が無ければ null。 */
export function mapCatalogModel(raw: unknown, provider: string): AiModelInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as CatalogModel;
  const name = typeof m.name === "string" ? m.name : "";
  if (!name) return null;
  const task = typeof m.task === "string" ? m.task : m.task?.name;
  const props = Array.isArray(m.properties) ? m.properties : [];
  const pricing: AiModelPrice[] = [];
  let contextWindow: number | undefined;
  let outputDimensions: number | undefined;
  for (const p of props) {
    if (p.property_id === "price" && Array.isArray(p.value)) {
      for (const item of p.value) {
        if (!item || typeof item !== "object") continue;
        const row = item as { unit?: unknown; price?: unknown; currency?: unknown };
        if (typeof row.price !== "number" || !Number.isFinite(row.price)) continue;
        pricing.push({
          unit: typeof row.unit === "string" ? row.unit : "",
          price: row.price,
          currency: typeof row.currency === "string" ? row.currency : "USD",
        });
      }
    }
    if (p.property_id === "context_window") {
      const n = Number(p.value);
      if (Number.isFinite(n)) contextWindow = n;
    }
    if (p.property_id === "output_dimensions") {
      const n = Number(p.value);
      if (Number.isFinite(n)) outputDimensions = n;
    }
  }
  return {
    value: name,
    label: name.replace(/^@[^/]+\//, ""),
    provider,
    task,
    description: typeof m.description === "string" ? m.description : undefined,
    pricing: pricing.length > 0 ? pricing : undefined,
    contextWindow,
    outputDimensions,
  };
}

function isSelectableCatalogTask(name: string, task: string | undefined): boolean {
  if (isDecisionModel(name)) return false;
  return isTextGenerationTask(task) || isEmbeddingTask(task);
}

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

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  /** プロンプトキャッシュヒット分（Chat Completions / Responses 両形式を拾う）。 */
  cachedTokens: number;
  cacheWriteTokens: number;
}

/**
 * token 使用量を読む。`prompt_tokens_details`（Chat Completions）と
 * `input_tokens_details`（Responses）の両方を拾い、cache 分は二重計上しない。
 */
export function extractUsage(result: unknown): AiTokenUsage | undefined {
  if (!result || typeof result !== "object") return undefined;
  const usage = (result as { usage?: Record<string, unknown> }).usage;
  if (!usage) return undefined;
  const detail = (usage.prompt_tokens_details ?? usage.input_tokens_details) as
    | Record<string, unknown>
    | undefined;
  const cached = Number(detail?.cached_tokens ?? 0);
  const write = Number(detail?.cache_write_tokens ?? 0);
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    cachedTokens: Number.isFinite(cached) ? cached : 0,
    cacheWriteTokens: Number.isFinite(write) ? write : 0,
  };
}

export interface AiUsageEvent {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  durationMs: number;
}

export interface WorkersAiProviderOptions {
  model?: string;
  apiToken?: string;
  accountId?: string;
  onUsage?: (event: AiUsageEvent) => void;
}

/**
 * Workers AI binding が既定。partner モデル（`vendor/model`、`@` なし）も
 * まず binding を試す。binding が失敗し、かつ REST 用のトークンが有る場合のみ
 * `/ai/v1/chat/completions` にフォールバックする。401/403 が出たら
 * isolate 内では REST を再試行しない。
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
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ];
    const maxTokens = req.maxTokens ?? 4096;
    const extras = partnerExtras(model, req);
    const started = Date.now();

    let text: string;
    let usage: AiTokenUsage | undefined;
    try {
      const bound = await this.completeViaBinding(model, messages, maxTokens, extras);
      text = bound.text;
      usage = bound.usage;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const canFallback =
        !this.#restAuthFailed &&
        !!this.opts.apiToken &&
        !!this.opts.accountId &&
        isPartnerModelId(model);
      if (!canFallback) throw err;
      console.warn("[workers-ai] binding failed, falling back to REST:", msg.slice(0, 200));
      const rest = await this.completeViaRest(model, messages, maxTokens, extras);
      text = rest.text;
      usage = rest.usage;
    }

    this.opts.onUsage?.({
      model,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      durationMs: Date.now() - started,
    });
    return text;
  }

  /**
   * Clef による裁定。decision 非対応 binding は例外になるので、
   * 呼び出し側が Luna にフォールバックできるよう握りつぶさない。
   */
  async decide(req: AiDecisionRequest): Promise<AiDecisionResult> {
    const payload = {
      model: "clef",
      state: req.state,
      questions: req.questions,
    };
    const run = this.ai.run(DEFAULT_ROUTING_CONFIG.clefModel as keyof AiModels, payload as never) as Promise<unknown>;
    const result = await withTimeout(run, AI_TIMEOUT_MS, "Workers AI decision timed out");
    const answers = (result as { answers?: unknown })?.answers;
    if (!answers || typeof answers !== "object") {
      throw new Error("decision model returned no answers");
    }
    return { answers: answers as Record<string, unknown> };
  }

  private async completeViaBinding(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    extras: Record<string, unknown>
  ): Promise<{ text: string; usage?: AiTokenUsage }> {
    const payload = { messages, max_tokens: maxTokens, ...extras };
    const run = this.ai.run(model as keyof AiModels, payload as never) as Promise<unknown>;
    const result = await withTimeout(run, AI_TIMEOUT_MS, `Workers AI binding timed out after ${AI_TIMEOUT_MS}ms`);
    return { text: extractCompletionText(result), usage: extractUsage(result) };
  }

  /**
   * パートナーモデルの REST フォールバック。binding が使えない場合の保険。
   */
  private async completeViaRest(
    model: string,
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    extras: Record<string, unknown>
  ): Promise<{ text: string; usage?: AiTokenUsage }> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.opts.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, ...extras }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = `${res.status} ${await res.text()}`;
      if (/\b401\b|\b403\b|Invalid User Credentials|2021/.test(detail)) this.#restAuthFailed = true;
      throw new Error(`Workers AI REST request failed: ${detail}`);
    }
    const json: unknown = await res.json();
    return { text: extractCompletionText(json), usage: extractUsage(json) };
  }

  /**
   * テキスト埋め込み。バッチ上限はモデル依存（Qwen3 は 32 件）。
   * インデックスを持たないため、次元検証は不要。
   */
  async embed(texts: string[], model?: string): Promise<number[][]> {
    const id = model && isWorkersAiModelId(model) ? model : DEFAULT_EMBEDDING_MODEL;
    const out: number[][] = [];
    const started = Date.now();
    for (let i = 0; i < texts.length; i += EMBED_BATCH_LIMIT) {
      const batch = texts.slice(i, i + EMBED_BATCH_LIMIT);
      const run = this.ai.run(id as keyof AiModels, { text: batch } as never) as Promise<{
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
      model: id,
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
    let models = await this.listModelsFromBinding();
    const hasPricing = models.some((m) => (m.pricing?.length ?? 0) > 0);
    if (!hasPricing && this.opts.apiToken && this.opts.accountId) {
      try {
        models = await this.listModelsFromRest();
      } catch {
        // binding 結果のまま（料金なし）
      }
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

  private async listModelsFromBinding(): Promise<AiModelInfo[]> {
    const models: AiModelInfo[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const batch = await this.ai.models({ per_page: perPage, page });
      for (const raw of batch) {
        const mapped = mapCatalogModel(raw, this.name);
        if (!mapped || !isSelectableCatalogTask(mapped.value, mapped.task)) continue;
        models.push(mapped);
      }
      if (batch.length < perPage) break;
    }
    return models;
  }

  private async listModelsFromRest(): Promise<AiModelInfo[]> {
    const models: AiModelInfo[] = [];
    const perPage = 100;
    for (let page = 1; ; page++) {
      const url = new URL(
        `https://api.cloudflare.com/client/v4/accounts/${this.opts.accountId}/ai/models/search`
      );
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.opts.apiToken}` },
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`Workers AI model search failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as { result?: unknown };
      const batch = Array.isArray(json.result) ? json.result : [];
      for (const raw of batch) {
        const mapped = mapCatalogModel(raw, this.name);
        if (!mapped || !isSelectableCatalogTask(mapped.value, mapped.task)) continue;
        models.push(mapped);
      }
      if (batch.length < perPage) break;
    }
    return models;
  }
}

/** `@cf/...` カタログ以外（`openai/gpt-6-luna` 等）は partner 扱い。 */
export function isPartnerModelId(id: string): boolean {
  return !id.startsWith("@") && id.includes("/");
}

/**
 * `@cf/` モデルは reasoning_effort / prompt_cache_key を受け取らないため、
 * partner モデルのときだけ付与する。
 */
function partnerExtras(model: string, req: AiCompletionRequest): Record<string, unknown> {
  if (!isPartnerModelId(model)) return {};
  const extras: Record<string, unknown> = {};
  if (req.reasoningEffort) extras.reasoning_effort = req.reasoningEffort;
  if (req.cacheKey) extras.prompt_cache_key = req.cacheKey;
  return extras;
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
