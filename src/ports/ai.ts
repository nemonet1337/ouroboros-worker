import type { ReasoningEffort } from "../config/routing";

export interface AiCompletionRequest {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  /** partner モデルのみ送到。@cf/ モデルには付けない。 */
  reasoningEffort?: ReasoningEffort;
  /** プロンプトキャッシュのキー。partner モデルのみ送到。 */
  cacheKey?: string;
}

export interface AiModelPrice {
  unit: string;
  price: number;
  currency: string;
}

/** A model exposed by an AI backend, as shown in the GUI model selector. */
export interface AiModelInfo {
  /** Identifier passed back to the provider (e.g. "openai/gpt-6-luna", "@cf/moonshotai/kimi-k2.6"). */
  value: string;
  label: string;
  provider: string;
  task?: string;
  description?: string;
  pricing?: AiModelPrice[];
  contextWindow?: number;
  outputDimensions?: number;
}

/** Clef（decision model）に渡す型付き質問。 */
export type AiClefQuestion =
  | { type: "score"; instructions: string; rubric: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };

export interface AiDecisionRequest {
  state: string;
  questions: Record<string, AiClefQuestion>;
}

/** `answers.<key>.<type>` に確率列入の裁定が返る。形はモデル依存なので呼び出し側で解釈する。 */
export interface AiDecisionResult {
  answers: Record<string, unknown>;
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
  embed?(texts: string[], model?: string): Promise<number[][]>;
  /** decision model による裁定。decision 非対応バックエンドは undefined。 */
  decide?(req: AiDecisionRequest): Promise<AiDecisionResult>;
}
