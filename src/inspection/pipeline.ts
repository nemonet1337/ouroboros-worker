/**
 * 選択リポジトリの非同期コード解析パイプライン。
 *
 * 貼り付け方式ではなく、選択リポジトリを対象に
 *   1. indexing  — Vectorize コードインデックスの構築（古い/未構築時）
 *   2. searching — 指示に関連するコードチャンクの検索
 *   3. analyzing — ファイル単位の AI 解析（小さな JSON スキーマで複数回）
 *   4. completed / failed
 * とステップを進め、各ステップで inspections.progress を更新する。
 */
import type { WorkerContext } from "../context";
import type { Logger } from "../logging/logger";
import { InspectionRepository, SettingsRepository } from "../db/repositories";
import { CodeIndexer, CODE_INDEX_STATUS_KEY, type CodeIndexStatus } from "../vectorize/code.indexer";
import type { GitHubProvider } from "../vcs/github.provider";
import { InspectionEngine } from "../inspection/inspection.engine";
import { WeightAdvisor } from "../inspection/weight.advisor";
import { defaultInspectionConfig } from "../config/inspection.config";
import type { InspectionRequest, Language } from "../types";
import { newId } from "../auth/tokens";

const INDEX_STALE_MS = 60 * 60 * 1000; // 1 時間
const MAX_ANALYSIS_FILES = 6;

export interface ProgressStep {
  step: string;
  message: string;
  at: number;
}

const EXT_TO_LANGUAGE: Record<string, Language> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  cc: "cpp",
  h: "cpp",
  hpp: "cpp",
  rb: "ruby",
  dart: "flutter",
};

function detectLanguage(paths: string[]): Language {
  for (const p of paths) {
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    if (EXT_TO_LANGUAGE[ext]) return EXT_TO_LANGUAGE[ext];
  }
  return "typescript";
}

export interface RunAnalysisOptions {
  ctx: WorkerContext;
  log: Logger;
  inspectionId: string;
  userId: string;
  instruction: string;
}

/**
 * 単一の inspection 行に対する解析パイプラインを実行する。
 * ステップごとに inspections.progress を更新し、最後に結果を書き込む。
 */
export async function runInspectionPipeline(opts: RunAnalysisOptions): Promise<void> {
  const { ctx, log, inspectionId, userId, instruction } = opts;
  const inspections = new InspectionRepository(ctx.ports.db);
  const settings = new SettingsRepository(ctx.ports.db);
  const steps: ProgressStep[] = [];

  const push = async (step: string, message: string, status = step) => {
    steps.push({ step, message, at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, status, steps);
  };

  try {
    const vectorizeCode = ctx.ports.vectorizeCode;
    const vcs = ctx.ports.vcs as GitHubProvider;

    if (!vectorizeCode || !ctx.ports.ai.embed) {
      // Vectorize が無い場合は RAG をスキップし、代表ファイルを直接取得して解析する
      await push("analyzing", "Vectorize 未設定のため、リポジトリのファイルを直接解析します。", "analyzing");
      const files = await vcs.getRepoFiles(MAX_ANALYSIS_FILES);
      await analyzeAndStore({ ctx, inspections, inspectionId, userId, instruction, files, steps });
      return;
    }

    const indexer = new CodeIndexer(vectorizeCode, ctx.ports.ai, vcs, settings);

    // 1. indexing — 古い/未構築ならインデックス再構築
    const currentStatus = await indexer.getStatus();
    if (needsReindex(currentStatus)) {
      await push("indexing", "コードインデックスを構築しています（Vectorize）…", "indexing");
      const status = await indexer.reindex();
      if (status.status === "failed") {
        await push("indexing", `インデックス構築に失敗しました: ${status.error ?? "不明なエラー"}`, "indexing");
      } else {
        await push("indexing", `インデックス構築完了（${status.files} ファイル / ${status.chunks} チャンク）。`, "indexing");
      }
    } else {
      await push("indexing", "既存のコードインデックスを使用します。", "indexing");
    }

    // 2. searching — 指示に関連するチャンクを検索
    await push("searching", "関連するコードを Vectorize で検索しています…", "searching");
    const query = instruction.trim() || "コード全体の品質・セキュリティ・パフォーマンス上の問題";
    const snippets = await indexer.search(query, 12);
    const targetPaths = uniqueTopPaths(snippets.map((s) => s.file), MAX_ANALYSIS_FILES);
    await push(
      "searching",
      snippets.length > 0
        ? `関連チャンク ${snippets.length} 件を取得（対象ファイル: ${targetPaths.join(", ") || "なし"}）。`
        : "関連チャンクが見つからなかったため代表ファイルを解析します。",
      "searching"
    );

    // 3. analyzing — 対象ファイルの本文を取得して AI 解析
    await push("analyzing", "AI によるコード解析を実行しています…", "analyzing");
    const allFiles = await vcs.getRepoFiles(300);
    let files = allFiles.filter((f) => targetPaths.includes(f.path));
    if (files.length === 0) files = allFiles.slice(0, MAX_ANALYSIS_FILES);

    await analyzeAndStore({ ctx, inspections, inspectionId, userId, instruction, files, steps });
    await log.info("inspection pipeline complete", { id: inspectionId, files: files.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    steps.push({ step: "failed", message: `解析に失敗しました: ${message}`, at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, "failed", steps);
    await log.error("inspection pipeline failed", { id: inspectionId, reason: message });
  }
}

async function analyzeAndStore(opts: {
  ctx: WorkerContext;
  inspections: InspectionRepository;
  inspectionId: string;
  userId: string;
  instruction: string;
  files: Array<{ path: string; content: string }>;
  steps: ProgressStep[];
}): Promise<void> {
  const { ctx, inspections, inspectionId, userId, instruction, files, steps } = opts;
  if (files.length === 0) {
    steps.push({ step: "failed", message: "解析対象のファイルが取得できませんでした。", at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, "failed", steps);
    return;
  }

  const language = detectLanguage(files.map((f) => f.path));
  const req: InspectionRequest = {
    id: newId(),
    language,
    files: files.map((f) => ({ path: f.path, content: f.content })),
    requestedAt: new Date().toISOString(),
  };

  const model = await ctx.auth.resolveModel(userId, "inspection");
  const advisor = ctx.ports.vectorize ? new WeightAdvisor(ctx.ports.vectorize) : undefined;
  const engine = new InspectionEngine(
    ctx.ports.ai,
    { ai: { ...defaultInspectionConfig.ai, model } },
    advisor
  );

  const result = await engine.inspect(req);
  if (instruction.trim()) {
    (result as unknown as { instruction?: string }).instruction = instruction.trim();
  }

  steps.push({
    step: "completed",
    message: `解析が完了しました（総合スコア ${Math.round(result.scoreCard.overall)} / グレード ${result.scoreCard.grade}）。`,
    at: Date.now(),
  });
  await inspections.updateProgress(inspectionId, userId, "completed", steps);
  await inspections.setResult(inspectionId, userId, JSON.stringify(result), "completed");
}

function needsReindex(status: CodeIndexStatus | null): boolean {
  if (!status) return true;
  if (status.status !== "done") return true;
  return Date.now() - status.updatedAt > INDEX_STALE_MS;
}

function uniqueTopPaths(paths: string[], limit: number): string[] {
  const out: string[] = [];
  for (const p of paths) {
    if (!out.includes(p)) out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export { CODE_INDEX_STATUS_KEY };
