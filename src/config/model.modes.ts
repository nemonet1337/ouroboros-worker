/**
 * AI モデルをモード別に切り替えるためのモード定義。
 * 各モードのモデルは users.mode_models（JSON）に保存され、
 * 未設定時は users.model（グローバル設定）→ DEFAULT_WORKERS_AI_MODEL の順で解決される。
 */
export type ModelMode = "coding" | "plan" | "refactor" | "healing" | "inspection";

export const MODEL_MODES: ModelMode[] = ["coding", "plan", "refactor", "healing", "inspection"];

export const MODEL_MODE_LABELS: Record<ModelMode, string> = {
  coding: "Coding（コード生成・デバッグ）",
  plan: "Plan（実装計画）",
  refactor: "Refactor（リファクタリング提案）",
  healing: "Healing（自己修復解析）",
  inspection: "Inspection（コード検査）",
};

export function isModelMode(value: string): value is ModelMode {
  return (MODEL_MODES as string[]).includes(value);
}
