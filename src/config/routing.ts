/**
 * モデル選定の設定。3 つの役割（Efficiency / Performance / Embed）を
 * システム全体で 1 つずつ選ぶ。
 *
 * codegen の前に判定モデル（router）が実装難易度を判定し、`solThreshold`
 * 以上なら Performance、未満なら Efficiency を使う。
 * 判定バックエンドは OpenAI Decisions API / OpenRouter Decisions（remote）と
 * ローカル Laya（local）の 2 系統から選ぶ。
 */
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_ROUTER_MODEL, isEmbeddableModelId } from "./deployment";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type DecisionBackend = "remote" | "local";

export interface RoutingConfig {
  /** 難易度判定に使うモデル（`provider/model`）。remote backend 用。 */
  routerModel: string;
  /** 判定をローカル Laya で行うか。既定 remote。 */
  decisionBackend: DecisionBackend;
  /** ローカル Laya の URL（laya-serve の `POST /v1/systemone`）。 */
  localDecisionUrl: string;
  /** ローカル Laya のモデル名（english / multilingual / typed-decisions）。 */
  localDecisionModel: string;
  /** ファイル選択にもローカル Laya を使うか。 */
  localFileSelection: boolean;
  /** difficulty がこの値以上なら Performance を使う（1〜5）。 */
  solThreshold: number;
  /** 効率系モデル。inspection / healing / refactor もこれを使う。 */
  efficiencyModel: string;
  efficiencyEffort: ReasoningEffort;
  /** 性能系モデル。判定が「難しい」だったときの codegen に使う。 */
  performanceModel: string;
  performanceEffort: ReasoningEffort;
  /** コード検索の埋め込みモデル。 */
  embedModel: string;
}

export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  routerModel: DEFAULT_ROUTER_MODEL,
  decisionBackend: "remote",
  localDecisionUrl: "http://127.0.0.1:8000",
  localDecisionModel: "typed-decisions",
  localFileSelection: true,
  solThreshold: 4,
  efficiencyModel: DEFAULT_ROUTER_MODEL,
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

function backend(value: unknown): DecisionBackend {
  return value === "local" ? "local" : "remote";
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** JSON を RoutingConfig に正規化する。不正な項目は既定値へ落とす。 */
export function parseRoutingConfig(raw: unknown): RoutingConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_ROUTING_CONFIG };
  const o = raw as Record<string, unknown>;
  const threshold = Number(o.solThreshold);
  return {
    routerModel: str(o.routerModel, DEFAULT_ROUTING_CONFIG.routerModel),
    decisionBackend: backend(o.decisionBackend),
    localDecisionUrl: str(o.localDecisionUrl, DEFAULT_ROUTING_CONFIG.localDecisionUrl),
    localDecisionModel: str(o.localDecisionModel, DEFAULT_ROUTING_CONFIG.localDecisionModel),
    localFileSelection: bool(o.localFileSelection, DEFAULT_ROUTING_CONFIG.localFileSelection),
    solThreshold:
      Number.isFinite(threshold) && threshold >= 1 && threshold <= 5
        ? Math.trunc(threshold)
        : DEFAULT_ROUTING_CONFIG.solThreshold,
    efficiencyModel: str(o.efficiencyModel, DEFAULT_ROUTING_CONFIG.efficiencyModel),
    efficiencyEffort: effort(o.efficiencyEffort, DEFAULT_ROUTING_CONFIG.efficiencyEffort),
    performanceModel: str(o.performanceModel, DEFAULT_ROUTING_CONFIG.performanceModel),
    performanceEffort: effort(o.performanceEffort, DEFAULT_ROUTING_CONFIG.performanceEffort),
    embedModel: isEmbeddableModelId(str(o.embedModel, DEFAULT_ROUTING_CONFIG.embedModel))
      ? str(o.embedModel, DEFAULT_ROUTING_CONFIG.embedModel)
      : DEFAULT_ROUTING_CONFIG.embedModel,
  };
}

/** decisions API が使える model id か（openai / openrouter のみ）。 */
export function isDecisionCapableModel(id: string): boolean {
  return id.startsWith("openai/") || id.startsWith("openrouter/");
}
