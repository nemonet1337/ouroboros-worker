export interface AiCompletionRequest {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}

/** A model exposed by an AI backend, as shown in the GUI model selector. */
export interface AiModelInfo {
  /** Identifier passed back to the provider (e.g. "claude-sonnet-4-6", "@cf/meta/llama-3.1-8b-instruct"). */
  value: string;
  label: string;
  provider: string;
  task?: string;
  description?: string;
}

/**
 * Abstraction over an LLM text-completion backend.
 * Implementations: AnthropicProvider (fetch-based, local/self-hosted only),
 * WorkersAiProvider (Cloudflare Workers AI binding, edge only).
 */
export interface AiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<string>;
  /** Enumerate every model this backend can serve. */
  listModels?(): Promise<AiModelInfo[]>;
}
