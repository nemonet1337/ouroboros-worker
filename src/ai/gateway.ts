import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_TEXT_MODEL,
  EMBED_BATCH_LIMIT,
  isTextGenerationTask,
} from "../config/deployment";
import type {
  AiCompletionRequest,
  AiDecisionRequest,
  AiDecisionResult,
  AiModelInfo,
  AiModelPrice,
  AiProvider,
  LocalDecisionConfig,
} from "./types";
import type { ReasoningEffort } from "../config/routing";
import { decideLaya, decideOpenAI, decideOpenRouter } from "./decisions";

const AI_TIMEOUT_MS = 600_000;
const MODELS_TTL_MS = 60 * 60 * 1000;
const XAI_TIMEOUT_MS = 3_600_000;

export interface AiUsageEvent {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  cacheWriteTokens?: number;
  durationMs: number;
}

export interface LlmGatewayOptions {
  openaiKey?: string;
  anthropicKey?: string;
  xaiKey?: string;
  openrouterKey?: string;
  layaKey?: string;
  onUsage?: (event: AiUsageEvent) => void;
}

interface ProviderEntry {
  key?: string;
  baseUrl: string;
  timeoutMs: number;
}

function providerEntry(provider: string, opts: LlmGatewayOptions): ProviderEntry | null {
  switch (provider) {
    case "openai":
      return { key: opts.openaiKey, baseUrl: "https://api.openai.com/v1", timeoutMs: AI_TIMEOUT_MS };
    case "anthropic":
      return { key: opts.anthropicKey, baseUrl: "https://api.anthropic.com/v1", timeoutMs: AI_TIMEOUT_MS };
    case "xai":
      return { key: opts.xaiKey, baseUrl: "https://api.x.ai/v1", timeoutMs: XAI_TIMEOUT_MS };
    case "openrouter":
      return { key: opts.openrouterKey, baseUrl: "https://openrouter.ai/api/v1", timeoutMs: AI_TIMEOUT_MS };
    default:
      return null;
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

/** Chat Completions 形式（OpenAI / xAI / OpenRouter）の本文と usage を読む。 */
function readOpenAIish(json: unknown): { text: string; usage: AiUsageEvent | undefined } {
  const obj = (json ?? {}) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  const content = obj.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  const u = obj.usage;
  return {
    text,
    usage: u
      ? {
          model: "",
          promptTokens: u.prompt_tokens ?? 0,
          completionTokens: u.completion_tokens ?? 0,
          cachedTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
          durationMs: 0,
        }
      : undefined,
  };
}

/** Anthropic Messages API の本文と usage を読む。 */
function readAnthropic(json: unknown): { text: string; usage: AiUsageEvent | undefined } {
  const obj = (json ?? {}) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = Array.isArray(obj.content)
    ? obj.content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("")
    : "";
  const u = obj.usage;
  return {
    text,
    usage: u
      ? {
          model: "",
          promptTokens: u.input_tokens ?? 0,
          completionTokens: u.output_tokens ?? 0,
          cachedTokens: 0,
          durationMs: 0,
        }
      : undefined,
  };
}

/**
 * `provider/model` 形式の model id を 4 プロバイダの REST に振り分ける
 * AI ゲートウェイ。キーは `.env` のみから受け取る。
 */
export class LlmGateway implements AiProvider {
  readonly name = "ouroboros";
  #modelsCache: { at: number; models: AiModelInfo[] } | undefined;

  constructor(private readonly opts: LlmGatewayOptions = {}) {}

  async complete(req: AiCompletionRequest): Promise<string> {
    const model = req.model ?? DEFAULT_TEXT_MODEL;
    const provider = model.split("/")[0] ?? "";
    const entry = providerEntry(provider, this.opts);
    if (!entry || !entry.key) {
      throw new Error(`model ${model} is not available: no API key for provider "${provider}"`);
    }
    const parts = model.split("/").slice(1).join("/");

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ];
    const started = Date.now();
    let text: string;
    let usage: AiUsageEvent | undefined;

    if (provider === "anthropic") {
      const body: Record<string, unknown> = {
        model: parts,
        messages: [{ role: "user", content: req.prompt }],
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
      };
      const parsed = await withTimeout(
        this.postJson(`${entry.baseUrl}/messages`, entry.key, body, entry.timeoutMs, {
          "x-api-key": entry.key,
          "anthropic-version": "2023-06-01",
        }),
        entry.timeoutMs,
        "anthropic complete timed out"
      );
      const read = readAnthropic(parsed);
      text = read.text;
      usage = read.usage;
    } else {
      const body: Record<string, unknown> = {
        model: parts,
        messages,
        max_tokens: req.maxTokens ?? 4096,
      };
      this.applyPartnerExtras(body, provider, req);
      const parsed = await withTimeout(
        this.postJson(`${entry.baseUrl}/chat/completions`, entry.key, body, entry.timeoutMs),
        entry.timeoutMs,
        `${provider} complete timed out`
      );
      const read = readOpenAIish(parsed);
      text = read.text;
      usage = read.usage;
    }

    const event: AiUsageEvent = {
      model,
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      durationMs: Date.now() - started,
    };
    this.opts.onUsage?.(event);
    return text;
  }

  private applyPartnerExtras(
    body: Record<string, unknown>,
    provider: string,
    req: AiCompletionRequest
  ): void {
    if (provider !== "openrouter") return;
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort as ReasoningEffort;
    if (req.cacheKey) body.prompt_cache_key = req.cacheKey;
  }

  private async postJson(
    url: string,
    key: string,
    body: unknown,
    timeoutMs: number,
    extraHeaders?: Record<string, string>
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(extraHeaders ?? {}),
    };
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
      "request timed out"
    );
    if (!res.ok) {
      throw new Error(`${url} failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return res.json();
  }

  /**
   * テキスト埋め込み。バッチ上限 32 件。
   */
  async embed(texts: string[], model?: string): Promise<number[][]> {
    const id = model && providerEntry(model.split("/")[0] ?? "", this.opts)?.key
      ? model
      : DEFAULT_EMBEDDING_MODEL;
    const provider = id.split("/")[0] ?? "";
    const entry = providerEntry(provider, this.opts);
    if (!entry || !entry.key) {
      throw new Error(`embedding model ${id} is not available for provider "${provider}"`);
    }
    if (provider === "anthropic") {
      throw new Error("anthropic does not support embeddings");
    }
    const parts = id.split("/").slice(1).join("/");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_LIMIT) {
      const batch = texts.slice(i, i + EMBED_BATCH_LIMIT);
      const parsed = (await withTimeout(
        this.postJson(`${entry.baseUrl}/embeddings`, entry.key, { model: parts, input: batch }, entry.timeoutMs),
        entry.timeoutMs,
        "embedding timed out"
      )) as { data?: Array<{ embedding?: unknown }> } | null;
      const data = parsed?.data;
      if (!Array.isArray(data) || data.length !== batch.length) {
        throw new Error(`${provider} embeddings returned unexpected shape`);
      }
      for (const row of data) {
        if (!Array.isArray(row?.embedding)) throw new Error(`${provider} embeddings returned unexpected shape`);
        out.push(row.embedding as number[]);
      }
    }
    return out;
  }

  async listModels(): Promise<AiModelInfo[]> {
    const now = Date.now();
    if (this.#modelsCache && now - this.#modelsCache.at < MODELS_TTL_MS) {
      return this.#modelsCache.models;
    }
    const models = await this.fetchProviderModels();
    this.#modelsCache = { at: now, models };
    return models;
  }

  private async fetchProviderModels(): Promise<AiModelInfo[]> {
    const out: AiModelInfo[] = [];
    const jobs: Promise<AiModelInfo[]>[] = [];

    const openai = providerEntry("openai", this.opts);
    if (openai?.key) {
      jobs.push(
        this.getJson(`${openai.baseUrl}/models`, openai.key, {}, openai.timeoutMs)
          .then((json) => {
            const data = (json as { data?: Array<{ id?: string }> })?.data ?? [];
            return data
              .filter((m) => typeof m.id === "string")
              .map<AiModelInfo>((m) => ({
                value: `openai/${m.id}`,
                label: m.id as string,
                provider: "openai",
              }));
          })
          .catch(() => [])
      );
    }

    const anthropic = providerEntry("anthropic", this.opts);
    if (anthropic?.key) {
      jobs.push(
        this.getJson(`${anthropic.baseUrl}/models`, anthropic.key, {
          "x-api-key": anthropic.key,
          "anthropic-version": "2023-06-01",
        }, anthropic.timeoutMs)
          .then((json) => {
            const data = (json as { data?: Array<{ id?: string }> })?.data ?? [];
            return data
              .filter((m) => typeof m.id === "string")
              .map<AiModelInfo>((m) => ({
                value: `anthropic/${m.id}`,
                label: m.id as string,
                provider: "anthropic",
              }));
          })
          .catch(() => [])
      );
    }

    const xai = providerEntry("xai", this.opts);
    if (xai?.key) {
      jobs.push(
        this.getJson(`${xai.baseUrl}/models`, xai.key, {}, xai.timeoutMs)
          .then((json) => {
            const data = (json as { data?: Array<{ id?: string }> })?.data ?? [];
            return data
              .filter((m) => typeof m.id === "string")
              .map<AiModelInfo>((m) => ({
                value: `xai/${m.id}`,
                label: m.id as string,
                provider: "xai",
              }));
          })
          .catch(() => [])
      );
    }

    const openrouter = providerEntry("openrouter", this.opts);
    if (openrouter?.key) {
      jobs.push(
        this.getJson(`${openrouter.baseUrl}/models`, openrouter.key, {}, openrouter.timeoutMs)
          .then((json) => {
            const data = (json as { data?: OpenRouterModel[] })?.data ?? [];
            return mapOpenRouterModels(data);
          })
          .catch(() => [])
      );
      jobs.push(
        this.getJson(`${openrouter.baseUrl}/embeddings/models`, openrouter.key, {}, openrouter.timeoutMs)
          .then((json) => {
            const data = (json as { data?: Array<{ id?: string; name?: string }> })?.data ?? [];
            return data
              .filter((m) => typeof m.id === "string")
              .map<AiModelInfo>((m) => ({
                value: `openrouter/${m.id}`,
                label: m.name ?? (m.id as string),
                provider: "openrouter",
                task: "Text Embeddings",
              }));
          })
          .catch(() => [])
      );
    }

    for (const batch of await Promise.all(jobs)) out.push(...batch);
    return dedupeModels(out);
  }

  private async getJson(
    url: string,
    key: string,
    extraHeaders: Record<string, string>,
    timeoutMs: number
  ): Promise<unknown> {
    const res = await withTimeout(
      fetch(url, {
        headers: { Authorization: `Bearer ${key}`, ...extraHeaders },
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
      "model listing timed out"
    );
    if (!res.ok) {
      throw new Error(`${url} failed: ${res.status}`);
    }
    return res.json();
  }

  /**
   * decision model による裁定。
   * local backend が指定されていれば Laya を試し、失敗時に remote へフォールバックする。
   */
  async decide(req: AiDecisionRequest, local?: LocalDecisionConfig): Promise<AiDecisionResult> {
    if (local) {
      try {
        return await decideLaya(local, req, this.opts.layaKey);
      } catch (err) {
        console.warn("[gateway] local decision failed, falling back to remote:", err instanceof Error ? err.message : err);
      }
    }
    return this.decideRemote(req);
  }

  private async decideRemote(req: AiDecisionRequest): Promise<AiDecisionResult> {
    const model = req.model;
    const provider = model?.split("/")[0] ?? "";
    const entry = providerEntry(provider, this.opts);
    if (!model || !entry?.key) {
      throw new Error(`decision model ${String(model)} is not available for provider "${provider}"`);
    }
    if (provider === "openai") return decideOpenAI(model, req, entry.key);
    if (provider === "openrouter") return decideOpenRouter(model, req, entry.key);
    throw new Error(`provider "${provider}" does not support the decisions API`);
  }
}

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
}

function mapOpenRouterModels(data: OpenRouterModel[]): AiModelInfo[] {
  const out: AiModelInfo[] = [];
  for (const m of data) {
    if (typeof m.id !== "string") continue;
    const value = m.id.startsWith("openrouter/") ? m.id : `openrouter/${m.id}`;
    let pricing: AiModelPrice[] | undefined;
    if (m.pricing) {
      const prompt = Number(m.pricing.prompt);
      const completion = Number(m.pricing.completion);
      const values: string[] = [];
      if (Number.isFinite(prompt) && prompt > 0) values.push("input");
      if (Number.isFinite(completion) && completion > 0) values.push("output");
      pricing = values.map<AiModelPrice>((unit) => ({
        unit,
        price: unit === "input" ? prompt : completion,
        currency: "USD",
      }));
    }
    out.push({
      value,
      label: m.name ?? m.id,
      provider: "openrouter",
      task: "Text Generation",
      pricing,
      contextWindow: typeof m.context_length === "number" ? m.context_length : undefined,
    });
  }
  return out;
}

function dedupeModels(models: AiModelInfo[]): AiModelInfo[] {
  const seen = new Set<string>();
  const out: AiModelInfo[] = [];
  for (const m of models) {
    if (seen.has(m.value)) continue;
    seen.add(m.value);
    out.push(m);
  }
  return out.sort((a, b) =>
    isTextGenerationTask(a.task) === isTextGenerationTask(b.task) ? 0 : isTextGenerationTask(a.task) ? -1 : 1
  );
}
