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
 * Implementation: WorkersAiProvider (Cloudflare Workers AI — the only
 * permitted AI gateway).
 */
export interface AiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<string>;
  /** Enumerate every model this backend can serve. */
  listModels?(): Promise<AiModelInfo[]>;
  /** テキスト埋め込み（コードインデックス用）。未対応バックエンドは undefined。 */
  embed?(texts: string[]): Promise<number[][]>;
}
