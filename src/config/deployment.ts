/**
 * Ouroboros runs exclusively on Cloudflare Workers. The ONLY permitted AI
 * gateway is the Workers AI binding (env.AI); external gateway tokens are
 * rejected at the API layer and models are discovered dynamically from the
 * binding. The Workers AI REST API token (when used) lives solely in the
 * WORKERS_AI_API_TOKEN secret — never in the GUI config store.
 */

/** 効率系の既定モデル。inspection / healing / refactor はすべてこれを使う。 */
export const DEFAULT_WORKERS_AI_MODEL = "openai/gpt-6-luna";

/** 埋め込みモデル。インデックスを持たないため次元制約は無く、選択も固定。 */
export const DEFAULT_EMBEDDING_MODEL = "@cf/qwen/qwen3-embedding-0.6b";

/** `@cf/qwen/qwen3-embedding-0.6b` の入力配列は maxItems 32。 */
export const EMBED_BATCH_LIMIT = 32;

/** Luna がファイル候補として列挙する上限。 */
export const FILE_PICK_MAX = 24;

/**
 * Worker 内 cosine の計算量ガード。超過分は先頭へ切り詰める。
 * embedding は 32 件ずつ 1 subrequest なので、上限値は subrequest 数の 3 倍。
 * （200 にすると 1 回の検索で 7 回叩き、1 invocation の予算を圧迫する）
 */
export const MAX_RANKED_CHUNKS = 96;

export function isEmbeddingTask(task: string | undefined): boolean {
  return !!task && /embed/i.test(task);
}

export function isTextGenerationTask(task: string | undefined): boolean {
  return !task || task === "Text Generation";
}

/**
 * Clef / Clef-flash はカタログ上 Text Generation として登録されているが、
 * 出力は確率でありテキスト生成はできない。生成モデル候補から除外する。
 */
export function isDecisionModel(id: string): boolean {
  return /^@cf\/cloudflare\/clef/.test(id);
}

/**
 * Workers AI model ids are namespaced — either with an explicit catalog prefix
 * ("@cf/...", "@hf/...") or as partner-hosted "vendor/model" ids
 * (e.g. "openai/gpt-6-luna"). Anything without a namespace separator is an
 * external gateway model and is rejected.
 */
export function isWorkersAiModelId(id: string): boolean {
  return id.startsWith("@") || /^[a-z0-9][\w.-]*\/.+/i.test(id);
}

/** 保存済みの GLM を廃止モデルとして読み取り時に Luna へ寄せる。 */
export function remapRetiredModel(id: string | null | undefined): string | null {
  if (!id) return id ?? null;
  return /^@cf\/zai-org\/glm-/i.test(id) ? DEFAULT_WORKERS_AI_MODEL : id;
}
