import { InspectionRequest, Language, InspectionCategory } from "../types/inspection.types";
import { ASPECTS_BY_CATEGORY, ASPECT_DESCRIPTIONS } from "./aspects";

const CATEGORY_LABELS: Record<InspectionCategory, string> = {
  security: "security（セキュリティ）",
  performance: "performance（パフォーマンス）",
  redundancy: "redundancy（冗長性）",
  readability: "readability（可読性）",
  design: "design（設計）",
  correctness: "correctness（正確性）",
};

/** Build the "32観点" section of the system prompt from the aspect registry. */
function buildAspectGuide(): string {
  return (Object.entries(ASPECTS_BY_CATEGORY) as [InspectionCategory, (keyof typeof ASPECT_DESCRIPTIONS)[]][])
    .map(([cat, aspects]) => {
      const lines = aspects.map((a) => `   - \`${a}\`: ${ASPECT_DESCRIPTIONS[a]}`).join("\n");
      return `### ${CATEGORY_LABELS[cat]}\n${lines}`;
    })
    .join("\n");
}

const LANGUAGE_GUIDELINES: Record<Language, string> = {
  typescript:
    "TypeScript 5.x: satisfies演算子・const型パラメータ・Template Literal Types活用。any禁止。Utility Types(Pick/Omit/Partial等)積極活用。",
  javascript:
    "ES2024準拠: Optional Chaining・Nullish Coalescing・Array.at()・Object.groupBy()・Promise.any()等の最新API活用。var禁止。",
  python:
    "Python 3.12+: match文・TypeAlias・ParamSpec・型ヒント必須。list[T]形式ジェネリクス・f-string活用。walrus演算子の適切な使用。",
  go: "Go 1.22+: generics活用・range-over-integer・slices/mapsパッケージ。goroutineリーク防止・context伝播・errors.Is/As活用。",
  rust: "Rust最新安定版: Result/Option chain・?演算子・impl Trait・async/await。unsafe不使用。Clippy準拠。",
  java: "Java 21+: Record・Sealed Classes・Pattern Matching(instanceof)・Virtual Threads。Stream API積極活用。var適切使用。",
  csharp:
    "C# 12+: Primary Constructors・Collection Expressions・ref readonly parameters。Nullable有効化必須。async/await正しい使用。",
  cpp: "C++20+: Concepts・Ranges・Coroutines・Modules。Smart Pointers必須。RAII原則。",
  ruby: "Ruby 3.3+: パターンマッチング・endless method・numbered block parameters。Sorbet/RBS型定義推奨。",
  flutter: "Flutter/Dart 3.x: Records・Patterns・Class Modifiers。const constructor最大化。Riverpod/BLoC適切使用。",
};

export const SYSTEM_PROMPT = `あなたは世界最高峰のコードレビューエンジニアです。
静的解析ツールでは不可能な「コードの本質的な意図・設計の妥当性・セキュリティ上の弱点・パフォーマンスのボトルネック」を深く分析します。

## 評価する32観点（6カテゴリ × 細分化）

各カテゴリは複数の細かい観点に分解されています。\`scoreBreakdown\` には
**以下の32観点すべて**について 0〜100 のスコアと一文サマリーを必ず含めてください
（キー名は \`code\` の英字識別子をそのまま使用）。

${buildAspectGuide()}

## スコアリングの考え方
- 各観点は独立に 0〜100 で採点する（問題が無ければ高得点）
- 該当する事象がコード上に存在しない観点は、減点せず高めのスコアを付ける
- カテゴリ総合や全体スコアはシステム側が重み付けで自動集計するため、観点スコアのみ提出する

## 厳守事項
- Linterや静的解析で検知できる問題（インデント・未使用変数等）は指摘しない
- コンテキストを考慮した根拠を必ず示す
- before/afterコード例は実際に動作する具体的なコードで示す
- findings の category は6カテゴリ（security/performance/redundancy/readability/design/correctness）のいずれか
- scorePenalty: critical→20〜30、high→12〜20、medium→6〜12、low→2〜6、info→0〜2
- high/criticalには必ず改善案(recommendations)を提示する
- すべての記述は日本語（コードスニペット除く）
- 分析完了後は必ず \`submit_inspection\` ツールを呼び出す`;

const DEFAULT_PROJECT_CONTEXT =
  "汎用コードベース。プロジェクト固有のドメイン知識は不明のため、" +
  "コードの可読性・保守性・セキュリティ・パフォーマンスを一般的なベストプラクティスに基づいて評価してください。" +
  "特定のフレームワーク・ライブラリの慣習がある場合はそれを考慮し、" +
  "将来の拡張・チームでの保守を前提とした観点でレビューしてください。";

export function buildUserPrompt(request: InspectionRequest): string {
  const langGuide = LANGUAGE_GUIDELINES[request.language] ?? "";
  const categories =
    request.options?.enabledCategories?.join(", ") ??
    "security, performance, redundancy, readability, design, correctness";
  const granularity = request.options?.granularity ?? "file";

  const context = request.projectContext?.trim() || DEFAULT_PROJECT_CONTEXT;
  const contextSection = `\n## プロジェクトコンテキスト\n${context}\n`;

  const granularitySection =
    granularity === "function"
      ? `\n## 粒度の指示
ファイル全体の評価に加え、各ファイル内の **関数・メソッド・クラスごと** に分析し、
各ファイルの \`functions\` 配列に名前（クラスメソッドは ClassName.methodName 形式）・
行範囲・6次元のスコア内訳・findings・recommendations を必ず出力してください。\n`
      : "";

  const filesSection = request.files
    .map((f) => `### ${f.path}\n\`\`\`${request.language}\n${f.content}\n\`\`\``)
    .join("\n\n");

  return `# コードインスペクション依頼

**言語**: ${request.language}
**評価カテゴリ**: ${categories}
**粒度**: ${granularity}
${contextSection}${granularitySection}
## 言語固有ガイドライン
${langGuide}

## 対象ファイル（${request.files.length}件）

${filesSection}

上記コードを詳細分析し、\`submit_inspection\` ツールで結果を提出してください。`;
}
