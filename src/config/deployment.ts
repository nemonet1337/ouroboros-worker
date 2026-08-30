/**
 * Ouroboros runs exclusively on Cloudflare Workers. The ONLY permitted AI
 * gateway is the Workers AI binding (env.AI); external gateway tokens are
 * rejected at the API layer and models are discovered dynamically from the
 * binding. The Workers AI REST API token (when used) lives solely in the
 * WORKERS_AI_API_TOKEN secret — never in the GUI config store.
 */
/** Default Workers AI model used for every AI task unless overridden in the GUI. */
export const DEFAULT_WORKERS_AI_MODEL = "@cf/zai-org/glm-5.3-flash";

/** Default embedding model. Must emit 768-d vectors to match VECTORIZE. */
export const DEFAULT_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";

/** Vectorize `ouroboros-code-index` の次元。これ以外の Embedding は選択不可。 */
export const VECTORIZE_EMBEDDING_DIMS = 768;

/** カタログに output_dimensions が無いが 768 と分かっているモデル。 */
const KNOWN_768_EMBEDDING_MODELS = new Set([
  DEFAULT_EMBEDDING_MODEL,
  "@cf/baai/bge-base-en-v1.5",
]);

export function isEmbeddingTask(task: string | undefined): boolean {
  return !!task && /embed/i.test(task);
}

export function isTextGenerationTask(task: string | undefined): boolean {
  return !task || task === "Text Generation";
}

/** Vectorize 768 次元と揃う Embedding モデルだけ通す。 */
export function isCompatibleEmbeddingModel(id: string, outputDimensions?: number): boolean {
  if (KNOWN_768_EMBEDDING_MODELS.has(id)) return true;
  return outputDimensions === VECTORIZE_EMBEDDING_DIMS;
}

/**
 * Workers AI model ids are namespaced — either with an explicit catalog prefix
 * ("@cf/...", "@hf/...") or as partner-hosted "vendor/model" ids
 * (e.g. "minimax/m3"). Anything without a namespace separator is an external
 * gateway model and is rejected.
 */
export function isWorkersAiModelId(id: string): boolean {
  return id.startsWith("@") || /^[a-z0-9][\w.-]*\/.+/i.test(id);
}
