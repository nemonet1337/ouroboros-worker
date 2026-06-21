/**
 * Ouroboros runs exclusively on Cloudflare Workers. The ONLY permitted AI
 * gateway is the Workers AI binding (env.AI); external gateway tokens are
 * rejected at the API layer and models are discovered dynamically from the
 * binding. The Workers AI REST API token (when used) lives solely in the
 * WORKERS_AI_API_TOKEN secret — never in the GUI config store.
 */
export type DeployTarget = "cloudflare";

/** Default Workers AI model used for every AI task unless overridden in the GUI. */
export const DEFAULT_WORKERS_AI_MODEL = "minimax/m3";

/**
 * Workers AI model ids are namespaced — either with an explicit catalog prefix
 * ("@cf/...", "@hf/...") or as partner-hosted "vendor/model" ids
 * (e.g. "minimax/m3"). Anything without a namespace separator is an external
 * gateway model and is rejected.
 */
export function isWorkersAiModelId(id: string): boolean {
  return id.startsWith("@") || /^[a-z0-9][\w.-]*\/.+/i.test(id);
}
