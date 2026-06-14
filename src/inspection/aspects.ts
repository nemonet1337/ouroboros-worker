import type { InspectionAspect, InspectionCategory } from "../types";

/**
 * The 32 fine-grained inspection aspects, grouped under the 6 parent categories.
 * Each aspect rolls up into exactly one category; the category score is the
 * weight-normalised aggregate of its child aspects, and the overall score is the
 * weighted sum of all 32 aspect scores.
 */
export const ASPECTS_BY_CATEGORY: Record<InspectionCategory, InspectionAspect[]> = {
  security: [
    "injection",
    "authn_authz",
    "secrets",
    "input_validation",
    "deps_supply_chain",
    "crypto_transport",
  ],
  performance: [
    "algo_complexity",
    "memory_alloc",
    "async_concurrency",
    "io_network",
    "caching",
  ],
  redundancy: [
    "duplication",
    "dead_code",
    "over_engineering",
    "redundant_compute",
    "dep_bloat",
  ],
  readability: [
    "naming",
    "cognitive_complexity",
    "comments_docs",
    "formatting_consistency",
    "idiomatic_usage",
  ],
  design: [
    "srp_cohesion",
    "coupling",
    "abstraction_interface",
    "error_handling",
    "modularity_extensibility",
    "pattern_fit",
  ],
  correctness: [
    "logic_intent",
    "edge_cases",
    "null_boundary",
    "concurrency_correctness",
    "type_contract",
  ],
};

/** All 32 aspects in a stable order (parent-category order). */
export const ASPECTS: InspectionAspect[] = Object.values(ASPECTS_BY_CATEGORY).flat();

/** Reverse map: aspect → its parent category. */
export const ASPECT_CATEGORY: Record<InspectionAspect, InspectionCategory> = Object.fromEntries(
  (Object.entries(ASPECTS_BY_CATEGORY) as [InspectionCategory, InspectionAspect[]][]).flatMap(
    ([cat, aspects]) => aspects.map((a) => [a, cat] as const)
  )
) as Record<InspectionAspect, InspectionCategory>;

/** Japanese labels for GUI / prompt display. */
export const ASPECT_LABELS: Record<InspectionAspect, string> = {
  // security
  injection: "インジェクション (SQL/コマンド/XSS)",
  authn_authz: "認証・認可",
  secrets: "機密情報の取り扱い",
  input_validation: "入力検証・サニタイズ",
  deps_supply_chain: "依存関係・サプライチェーン",
  crypto_transport: "暗号・通信路保護",
  // performance
  algo_complexity: "アルゴリズム計算量 (Big-O)",
  memory_alloc: "メモリ・アロケーション効率",
  async_concurrency: "非同期・並行処理パターン",
  io_network: "I/O・ネットワーク効率",
  caching: "キャッシュ・メモ化",
  // redundancy
  duplication: "コード重複",
  dead_code: "デッドコード・到達不能コード",
  over_engineering: "過剰実装・不要な抽象化",
  redundant_compute: "冗長な再計算",
  dep_bloat: "依存肥大化",
  // readability
  naming: "命名の明確さ",
  cognitive_complexity: "認知的複雑度・ネスト",
  comments_docs: "コメント・ドキュメント",
  formatting_consistency: "整形・一貫性",
  idiomatic_usage: "言語イディオムの活用",
  // design
  srp_cohesion: "単一責任・凝集度",
  coupling: "結合度・依存方向",
  abstraction_interface: "抽象化・インターフェース設計",
  error_handling: "エラーハンドリング戦略",
  modularity_extensibility: "モジュール性・拡張性",
  pattern_fit: "設計パターンの妥当性",
  // correctness
  logic_intent: "ロジックと意図の整合",
  edge_cases: "エッジケース処理",
  null_boundary: "null・境界値の安全性",
  concurrency_correctness: "並行処理の正しさ (競合状態)",
  type_contract: "型安全性・契約遵守",
};

/** One-line description per aspect, injected into the system prompt. */
export const ASPECT_DESCRIPTIONS: Record<InspectionAspect, string> = {
  injection: "SQL/コマンド/XSS等のインジェクション余地",
  authn_authz: "認証・認可の欠落や不備、権限昇格",
  secrets: "ハードコードされた秘密情報・機密データの不適切な露出",
  input_validation: "外部入力の検証・サニタイズの欠如",
  deps_supply_chain: "既知脆弱性のある依存・サプライチェーンリスク",
  crypto_transport: "弱い暗号・平文通信・不適切な乱数",
  algo_complexity: "不要に高い時間/空間計算量",
  memory_alloc: "過剰なアロケーション・メモリリーク",
  async_concurrency: "非効率な非同期・直列化・無駄な待機",
  io_network: "N+1・冗長なI/O・バッチ化余地",
  caching: "キャッシュ・メモ化の欠如や誤用",
  duplication: "重複ロジック・コピーペースト",
  dead_code: "到達不能・未使用コード",
  over_engineering: "目的に対し過剰な抽象化・汎用化",
  redundant_compute: "同一結果の冗長な再計算",
  dep_bloat: "不要な依存・重量ライブラリの濫用",
  naming: "曖昧・誤解を招く命名",
  cognitive_complexity: "深いネスト・長大関数・高い認知負荷",
  comments_docs: "意図を補うコメント/ドキュメントの過不足",
  formatting_consistency: "スタイル・構造の一貫性 (linter検知可能な範囲を除く)",
  idiomatic_usage: "対象言語の最新イディオム活用度",
  srp_cohesion: "単一責任原則・凝集度",
  coupling: "過度な結合・依存方向の乱れ",
  abstraction_interface: "抽象化レベル・インターフェース境界の適切さ",
  error_handling: "例外/エラー処理の戦略と一貫性",
  modularity_extensibility: "モジュール分割・拡張容易性",
  pattern_fit: "設計パターン選択の妥当性",
  logic_intent: "実装と意図/仕様の乖離",
  edge_cases: "境界・例外シナリオの取りこぼし",
  null_boundary: "null/undefined・範囲外アクセスの安全性",
  concurrency_correctness: "競合状態・デッドロック・順序依存",
  type_contract: "型安全性・関数契約/不変条件の遵守",
};
