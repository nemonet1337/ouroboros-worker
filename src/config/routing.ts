/**
 * Clef によるモデル階層のルーティング設定。
 *
 * codegen の前に Clef が実装難易度を判定し、`solThreshold` 以上なら
 * Performance（Sol）、未満なら Efficiency（Luna）を使う。
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface RoutingConfig {
  /** 難易度判定に使う decision model。 */
  clefModel: string;
  /** difficulty がこの値以上なら Performance を使う（1〜5）。 */
  solThreshold: number;
  efficiencyModel: string;
  efficiencyEffort: ReasoningEffort;
  performanceModel: string;
  performanceEffort: ReasoningEffort;
}

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  clefModel: "@cf/cloudflare/clef-flash",
  solThreshold: 4,
  efficiencyModel: "openai/gpt-6-luna",
  efficiencyEffort: "low",
  performanceModel: "openai/gpt-6-sol",
  performanceEffort: "medium",
};

const EFFORTS: ReadonlySet<string> = new Set(["none", "low", "medium", "high"]);

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function effort(value: unknown, fallback: ReasoningEffort): ReasoningEffort {
  return typeof value === "string" && EFFORTS.has(value) ? (value as ReasoningEffort) : fallback;
}

/** JSON を RoutingConfig に正規化する。不正な項目は既定値へ落とす。 */
export function parseRoutingConfig(raw: unknown): RoutingConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_ROUTING_CONFIG };
  const o = raw as Record<string, unknown>;
  const threshold = Number(o.solThreshold);
  return {
    clefModel: str(o.clefModel, DEFAULT_ROUTING_CONFIG.clefModel),
    solThreshold:
      Number.isFinite(threshold) && threshold >= 1 && threshold <= 5
        ? Math.trunc(threshold)
        : DEFAULT_ROUTING_CONFIG.solThreshold,
    efficiencyModel: str(o.efficiencyModel, DEFAULT_ROUTING_CONFIG.efficiencyModel),
    efficiencyEffort: effort(o.efficiencyEffort, DEFAULT_ROUTING_CONFIG.efficiencyEffort),
    performanceModel: str(o.performanceModel, DEFAULT_ROUTING_CONFIG.performanceModel),
    performanceEffort: effort(o.performanceEffort, DEFAULT_ROUTING_CONFIG.performanceEffort),
  };
}
