import type { ReasoningEffort } from "../config/routing";

export interface AiCompletionRequest {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  /** partner モデルのみ送到。 */
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
  /** Identifier passed back to the provider (e.g. "openai/gpt-6-luna"). */
  value: string;
  label: string;
  provider: string;
  task?: string;
  description?: string;
  pricing?: AiModelPrice[];
  contextWindow?: number;
  outputDimensions?: number;
}

/** decision model（Jev 互換）に渡す型付き質問。 */
export type AiClefQuestion =
  | { type: "score"; instructions: string; rubric: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string };

export interface AiDecisionRequest {
  state: string;
  questions: Record<string, AiClefQuestion>;
  /** 判定に使う model id（`provider/model`）。remote backend 用。 */
  model?: string;
}

/** decision model の回答。形はバックエンド依存なので呼び出し側で解釈する。 */
export interface AiDecisionResult {
  answers: Record<string, unknown>;
}

/** ローカル Laya を使うときの接続先。 */
export interface LocalDecisionConfig {
  url: string;
  model: string;
  /** ファイル選択にもローカルを使うか。既定 true。 */
  fileSelection?: boolean;
}

/**
 * Abstraction over an LLM text-completion backend.
 * Implementation: LlmGateway (OpenAI / Anthropic / xAI / OpenRouter REST を
 * `provider/model` 形式の model id で振り分ける)。
 */
export interface AiProvider {
  readonly name: string;
  complete(req: AiCompletionRequest): Promise<string>;
  /** Enumerate every model this backend can serve. */
  listModels?(): Promise<AiModelInfo[]>;
  /** テキスト埋め込み（コード検索用）。未対応バックエンドは undefined。 */
  embed?(texts: string[], model?: string): Promise<number[][]>;
  /** decision model による裁定。decision 非対応バックエンドは undefined。 */
  decide?(req: AiDecisionRequest, local?: LocalDecisionConfig): Promise<AiDecisionResult>;
}
