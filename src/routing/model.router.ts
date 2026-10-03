import type { ReasoningEffort, RoutingConfig } from "../config/routing";
import type { AiClefQuestion, AiProvider } from "../ports";
import type { CodeSnippet } from "../retrieval/chunk.rank";

export type RouteTier = "efficiency" | "performance" | "unknown";

export interface RouteDecision {
  model: string;
  reasoningEffort: ReasoningEffort;
  /** Clef の score 回答。取得できなければ null。 */
  difficulty: number | null;
  tier: RouteTier;
  /** Clef が使えたか。false なら difficulty ではなく既定モデルで進めている。 */
  clefAvailable: boolean;
}

const DIFFICULTY_RUBRIC: Record<string, string> = {
  "1": "1ファイル以下の局所変更。設定値・型定義・コメントのみ",
  "2": "1〜2ファイル。既存パターンの踏襲で完了し、テスト追加のみ",
  "3": "3〜4ファイル。関数単位の変更で、既存抽象に収まる",
  "4": "複数モジュールに波及。共有 interface・スキーマ・型の変更を伴う",
  "5": "設計変更。移行・後方互換・複数層の横断修正が必要",
};

const TIER_CRITERIA = {
  efficiency: "局所的で既存パターンの踏襲で完了する。短い出力で足りる",
  performance: "横断的または設計的な変更で、長い推論と大量の出力が必要",
};

/**
 * score 回答から数値難易度を取り出す。Clef はラベル key と数値の両形式を
 * 返すため、両方を見て既定に落とす。
 */
export function parseDifficulty(answer: unknown): number | null {
  if (!answer || typeof answer !== "object") return null;
  const obj = answer as Record<string, unknown>;
  if (typeof obj.score === "number" && Number.isFinite(obj.score)) return obj.score;
  // { score: { score: 3, probabilities: {...} } } 形式
  const inner = obj.score;
  if (inner && typeof inner === "object") {
    const n = Number((inner as Record<string, unknown>).score);
    if (Number.isFinite(n)) return n;
  }
  // { score: "3" } 形式
  if (typeof obj.score === "string") {
    const n = Number(obj.score);
    if (Number.isFinite(n)) return n;
  }
  const probs = obj.probabilities;
  if (probs && typeof probs === "object") {
    let best = 0;
    let bestP = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(probs as Record<string, unknown>)) {
      const n = Number(key);
      const p = Number(value);
      if (Number.isFinite(n) && Number.isFinite(p) && p > bestP) {
        bestP = p;
        best = n;
      }
    }
    if (Number.isFinite(bestP)) return best;
  }
  return null;
}

/** choice 回答からどちらが選ばれたかを読む。 */
export function parseTier(answer: unknown): RouteTier {
  if (!answer || typeof answer !== "object") return "unknown";
  const obj = answer as Record<string, unknown>;
  const raw = typeof obj.choice === "string" ? obj.choice : undefined;
  if (raw === "efficiency" || raw === "performance") return raw;
  const probs = obj.probabilities;
  if (probs && typeof probs === "object") {
    let best: RouteTier = "unknown";
    let bestP = Number.NEGATIVE_INFINITY;
    for (const [key, value] of Object.entries(probs as Record<string, unknown>)) {
      if (key !== "efficiency" && key !== "performance") continue;
      const p = Number(value);
      if (Number.isFinite(p) && p > bestP) {
        bestP = p;
        best = key;
      }
    }
    return best;
  }
  return "unknown";
}

export interface RetrievalSummary {
  repoFileCount: number;
  snippets: CodeSnippet[];
}

/**
 * Clef の state を作る。
 *
 * `snippets.length` は入れない。topK で頭打ちになる定数情報なので、
 * 判定の分化に使えない。代わりに score の分布と kind 内訳を渡す。
 */
export function buildClefState(instruction: string, summary: RetrievalSummary): string {
  const { snippets } = summary;
  const lines: string[] = [];
  lines.push("## タスク");
  lines.push(instruction);
  lines.push("");
  lines.push("## リポジトリ規模");
  lines.push(`- ファイル数: ${summary.repoFileCount}`);

  if (snippets.length === 0) {
    lines.push("");
    lines.push("## 検索結果");
    lines.push("（該当コードなし）");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("## 検索結果（変更箇所の候補）");
  for (const s of snippets) {
    lines.push(
      `- ${s.file}:${s.startLine}-${s.endLine} [score=${s.score.toFixed(3)}, kind=${s.kind}, symbol=${s.symbol || "-"}]`
    );
  }

  const scores = snippets.map((s) => s.score);
  const kinds = new Map<string, number>();
  let lines4 = 0;
  for (const s of snippets) {
    kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
    lines4 += Math.max(0, s.endLine - s.startLine + 1);
  }
  const uniqueFiles = new Set(snippets.map((s) => s.file)).size;

  lines.push("");
  lines.push("## 集計");
  lines.push(`- 固有ファイル数: ${uniqueFiles}`);
  lines.push(
    `- score: 最大 ${Math.max(...scores).toFixed(3)} / 最小 ${Math.min(...scores).toFixed(3)} / 平均 ${(
      scores.reduce((a, b) => a + b, 0) / scores.length
    ).toFixed(3)}`
  );
  lines.push(`- kind 内訳: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(", ")}`);
  lines.push(`- 対象行数: 合計 約 ${lines4} 行`);
  lines.push(`- テストコード: ${snippets.some((s) => s.kind === "test") ? "あり" : "なし"}`);
  return lines.join("\n");
}

function questions(): Record<string, AiClefQuestion> {
  return {
    difficulty: {
      type: "score",
      instructions: "この実装タスクの難度を 1〜5 で評価せよ。",
      rubric: DIFFICULTY_RUBRIC,
    },
    tier: {
      type: "choice",
      instructions: "difficulty と検索結果の分散度から、実行すべきモデルを判定せよ。",
      criteria: TIER_CRITERIA,
    },
  };
}

/**
 * codegen の前にモデル階層を決める。Clef が使えない・失敗した場合は
 * 安全側（Efficiency=Luna）に倒す。
 */
export async function decideRoute(opts: {
  ai: AiProvider;
  instruction: string;
  summary: RetrievalSummary;
  config: RoutingConfig;
}): Promise<RouteDecision> {
  const fallback: RouteDecision = {
    model: opts.config.efficiencyModel,
    reasoningEffort: opts.config.efficiencyEffort,
    difficulty: null,
    tier: "unknown",
    clefAvailable: false,
  };
  if (!opts.ai.decide) return fallback;

  let answers: Record<string, unknown>;
  try {
    const result = await opts.ai.decide({
      state: buildClefState(opts.instruction, opts.summary),
      questions: questions(),
    });
    answers = result.answers;
  } catch (err) {
    console.warn("[router] Clef decision failed, using efficiency tier:", err instanceof Error ? err.message : err);
    return fallback;
  }

  const difficulty = parseDifficulty(answers.difficulty);
  if (difficulty === null) {
    return { ...fallback, clefAvailable: true, tier: parseTier(answers.tier) };
  }

  const usePerformance = difficulty >= opts.config.solThreshold;
  return {
    model: usePerformance ? opts.config.performanceModel : opts.config.efficiencyModel,
    reasoningEffort: usePerformance
      ? opts.config.performanceEffort
      : opts.config.efficiencyEffort,
    difficulty,
    tier: parseTier(answers.tier),
    clefAvailable: true,
  };
}
