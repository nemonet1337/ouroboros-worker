/**
 * Where Ouroboros is running. The two targets are intentionally hard-separated:
 *
 * - "local"      — self-hosted Node server (Docker Compose or bare metal).
 *                  AI access is configured through environment variables
 *                  (.env): ANTHROPIC_API_KEY, OURO_AI_MODEL, ... External
 *                  gateways (Anthropic, etc.) are allowed.
 * - "cloudflare" — Cloudflare Worker. The ONLY permitted AI gateway is the
 *                  Workers AI binding (env.AI); external gateway tokens are
 *                  rejected at the API layer and models are discovered
 *                  dynamically from the binding.
 */
export type DeployTarget = "local" | "cloudflare";

/** External AI gateway config keys that are only honoured on a local deploy. */
export const EXTERNAL_GATEWAY_CONFIG_KEYS = [
  "anthropicToken",
  "openaiToken",
  "geminiToken",
  "openrouterToken",
] as const;

/** Workers AI model ids are namespaced ("@cf/...", "@hf/..."). */
export function isWorkersAiModelId(id: string): boolean {
  return id.startsWith("@");
}
