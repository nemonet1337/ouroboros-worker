import type { AiProvider, AiCompletionRequest, AiModelInfo } from "../ports/ai";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";
const MODELS_URL = "https://api.anthropic.com/v1/models";

/** Shown when the live /v1/models listing is unavailable (no key, offline). */
const FALLBACK_MODELS: AiModelInfo[] = [
  { value: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic" },
];

/**
 * Fetch-based Anthropic Messages API client. Uses no SDK so it runs unchanged
 * on Node 22. Local/self-hosted deploys only — the Cloudflare Worker uses the
 * Workers AI binding exclusively and never instantiates this provider.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly defaultModel: string = DEFAULT_MODEL
  ) {}

  async complete(req: AiCompletionRequest): Promise<string> {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: req.model ?? this.defaultModel,
        max_tokens: req.maxTokens ?? 4096,
        system: req.system,
        messages: [{ role: "user", content: req.prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  /** List models from the Anthropic /v1/models API; static fallback when unavailable. */
  async listModels(): Promise<AiModelInfo[]> {
    if (!this.apiKey) return FALLBACK_MODELS;

    const models: AiModelInfo[] = [];
    let afterId: string | undefined;
    try {
      do {
        const url = new URL(MODELS_URL);
        url.searchParams.set("limit", "100");
        if (afterId) url.searchParams.set("after_id", afterId);
        const res = await fetch(url, {
          headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return FALLBACK_MODELS;
        const page = (await res.json()) as {
          data?: Array<{ id: string; display_name?: string }>;
          has_more?: boolean;
          last_id?: string;
        };
        for (const m of page.data ?? []) {
          models.push({ value: m.id, label: m.display_name ?? m.id, provider: "anthropic" });
        }
        afterId = page.has_more ? page.last_id : undefined;
      } while (afterId);
    } catch {
      return FALLBACK_MODELS;
    }
    return models.length ? models : FALLBACK_MODELS;
  }
}
