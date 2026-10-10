/**
 * Ouroboros runs on Node.js (>=24) and talks to external LLM providers over
 * REST. Model ids are namespaced as `provider/model`
 * (`openai/*`, `anthropic/*`, `xai/*`, `openrouter/*`).
 * API keys live solely in `.env` and are never returned to the GUI.
 */

/** 効率系の既定モデル。inspection / healing / refactor はすべてこれを使う。 */
export const DEFAULT_TEXT_MODEL = "openai/gpt-6-luna";

/** 性能系の既定モデル。判定が難しいとされた codegen で使う。 */
export const DEFAULT_PERFORMANCE_MODEL = "openai/gpt-6-sol";

/** 難易度判定の既定モデル（OpenAI Decisions API は gpt-6-luna のみ）。 */
export const DEFAULT_ROUTER_MODEL = "openai/gpt-6-luna";

/** 埋め込みモデル。 */
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** embedding の入力配列上限。 */
export const EMBED_BATCH_LIMIT = 32;

/** Luna がファイル候補として列挙する上限。 */
export const FILE_PICK_MAX = 24;

/** ローカル Laya の 1 バッチ上限。 */
export const LAYA_FILE_BATCH_LIMIT = 64;

/**
 * Worker 内 cosine の計算量ガード。超過分は先頭へ切り詰める。
 */
export const MAX_RANKED_CHUNKS = 96;

const PROVIDERS = ["openai", "anthropic", "xai", "openrouter"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export function isEmbeddingTask(task: string | undefined): boolean {
  return !!task && /embed/i.test(task);
}

export function isTextGenerationTask(task: string | undefined): boolean {
  return !task || task === "Text Generation" || task === "Text-to-text";
}

/**
 * 判定専用モデル。テキスト生成はできないので候補から除外する。
 * Decisions API 側のモデル（Jev / gpt-6-luna の decision モード）が
 * provider カタログに紛れ込んだ場合に備える。
 */
export function isDecisionModel(id: string): boolean {
  return /(^|\/)(typesafe\/)?jev([-/]|\.|$)/i.test(id) || /clef/i.test(id);
}

export function isProviderModelId(id: string): boolean {
  return new RegExp(`^(${PROVIDERS.join("|")})/\\S+`).test(id);
}

/** model id の先頭セグメント（provider 名）。未知なら null。 */
export function providerOfModel(id: string): ProviderName | null {
  const head = id.split("/")[0];
  return (PROVIDERS as readonly string[]).includes(head) ? (head as ProviderName) : null;
}

/** decisions API に対応する provider か。 */
export function isDecisionProvider(provider: string): boolean {
  return provider === "openai" || provider === "openrouter";
}

/** 埋め込みに対応する provider か。 */
export function isEmbeddingProvider(provider: string): boolean {
  return provider === "openai" || provider === "xai" || provider === "openrouter";
}

/** 埋め込みモデルとして保存可能か（anthropic は非対応）。 */
export function isEmbeddableModelId(id: string): boolean {
  const provider = providerOfModel(id);
  if (!provider) return false;
  return isEmbeddingProvider(provider);
}

/**
 * 保存済みの旧モデル（`@cf/…`・GLM）は無効化して既定へフォールバックさせる。
 * null を返したら呼び出し側で既定値を使う。
 */
export function remapRetiredModel(id: string | null | undefined): string | null {
  if (!id) return null;
  if (/^@cf\//i.test(id)) return null;
  if (/glm/i.test(id)) return null;
  return id;
}

/** 既定の埋め込みモデルにフォールバックする順に解決する。 */
export function resolveDefaultEmbeddingModel(providers: readonly string[]): string | null {
  if (providers.includes("openai")) return DEFAULT_EMBEDDING_MODEL;
  if (providers.includes("openrouter")) return `openrouter/${DEFAULT_EMBEDDING_MODEL}`;
  return null;
}
