/**
 * モデル選定の設定。3 つの役割（Efficiency / Performance / Embed）を
 * システム全体で 1 つずつ選ぶ。
 *
 * codegen の前に Clef が実装難易度を判定し、`solThreshold` 以上なら
 * Performance、未満なら Efficiency を使う。
 */
import { DEFAULT_EMBEDDING_MODEL } from "./deployment";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface RoutingConfig {
  /** 難易度判定に使う decision model。 */
  clefModel: string;
  /** difficulty がこの値以上なら Performance を使う（1〜5）。 */
  solThreshold: number;
  /** 効率系モデル。inspection / healing / refactor もこれを使う。 */
  efficiencyModel: string;
  efficiencyEffort: ReasoningEffort;
  /** 性能系モデル。Clef が「難しい」と判定したときの codegen に使う。 */
  performanceModel: string;
  performanceEffort: ReasoningEffort;
  /** コード検索の埋め込みモデル。インデックスは持たないため影響はembedding に限られる。 */
  embedModel: string;
}

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  clefModel: "@cf/cloudflare/clef-flash",
  solThreshold: 4,
  efficiencyModel: "openai/gpt-6-luna",
  efficiencyEffort: "low",
  performanceModel: "openai/gpt-6-sol",
  performanceEffort: "medium",
  embedModel: DEFAULT_EMBEDDING_MODEL,
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
    embedModel: str(o.embedModel, DEFAULT_ROUTING_CONFIG.embedModel),
  };
}
