/**
 * 選択リポジトリの非同期コード解析パイプライン。
 */
import type { WorkerContext } from "../context";
import type { Logger } from "../logging/logger";
import { InspectionRepository } from "../db/repositories";
import { selectPathsForAnalysis } from "../code/context.assembler";
import type { GitHubProvider } from "../vcs/github.provider";
import { InspectionEngine } from "../inspection/inspection.engine";
import { defaultInspectionConfig } from "../config/inspection.config";
import { DEFAULT_WORKERS_AI_MODEL } from "../config/deployment";
import type { InspectionRequest, Language } from "../types";

export const MAX_ANALYSIS_FILES = 6;

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

export function detectLanguage(paths: string[]): Language {
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

export async function runInspectionPipeline(opts: RunAnalysisOptions): Promise<void> {
  const { ctx, log, inspectionId, userId, instruction } = opts;
  const inspections = new InspectionRepository(ctx.ports.db);
  const steps: ProgressStep[] = [];

  const isCanceled = async (): Promise<boolean> => {
    const row = await inspections.find(inspectionId, userId);
    return row?.status === "canceled";
  };

  const push = async (step: string, message: string, status = step) => {
    if (await isCanceled()) return false;
    steps.push({ step, message, at: Date.now() });
    await inspections.updateProgress(inspectionId, userId, status, steps);
    return true;
  };

  try {
    if (await isCanceled()) return;

    const vcs = ctx.ports.vcs as unknown as GitHubProvider;
    const query = instruction.trim() || "コード全体の品質・セキュリティ・パフォーマンス上の問題";

    // 1. selecting — Luna に関連ファイルを選んでもらう
    if (!(await push("searching", "解析対象ファイルを選択しています…", "searching"))) return;

    let files: Array<{ path: string; content: string }> = [];
    try {
      const repo = await vcs.getRepoFiles(MAX_ANALYSIS_FILES * 8);
      const byPath = new Map(repo.map((f) => [f.path, f.content]));
      const selected = await selectPathsForAnalysis({
        query,
        ai: ctx.ports.ai,
        files: repo,
        maxFiles: MAX_ANALYSIS_FILES,
      });
      for (const path of selected.paths) {
        const content = byPath.get(path);
        if (content) files.push({ path, content });
      }
      if (
        !(await push(
          "searching",
          selected.snippets.length > 0
            ? `関連チャンク ${selected.snippets.length} 件を取得（対象ファイル: ${selected.paths.join(", ") || "なし"}）。`
            : "関連ファイルが選出できなかったため代表ファイルを解析します。",
          "searching"
        ))
      ) {
        return;
      }
    } catch (err) {
      console.warn("[inspection] file selection failed:", err instanceof Error ? err.message : err);
    }

    if (files.length === 0) {
      files = (await vcs.getRepoFiles(MAX_ANALYSIS_FILES)).slice(0, MAX_ANALYSIS_FILES);
    }

    if (await isCanceled()) return;

    // 2. analyzing
    if (!(await push("analyzing", "AI によるコード解析を実行しています…", "analyzing"))) return;

    if (await isCanceled()) return;
    await analyzeAndStore({ ctx, inspections, inspectionId, userId, instruction, files, steps });
    await log.info("inspection pipeline complete", { id: inspectionId, files: files.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (await isCanceled()) return;
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
    steps.push({
      step: "failed",
      message: "解析対象のファイルが取得できませんでした。",
      at: Date.now(),
    });
    await inspections.updateProgress(inspectionId, userId, "failed", steps);
    return;
  }

  const language = detectLanguage(files.map((f) => f.path));
  const req: InspectionRequest = {
    id: crypto.randomUUID(),
    language,
    files: files.map((f) => ({ path: f.path, content: f.content })),
    requestedAt: new Date().toISOString(),
  };

  const model = DEFAULT_WORKERS_AI_MODEL;
  const engine = new InspectionEngine(ctx.ports.ai, {
    ai: { ...defaultInspectionConfig.ai, model, maxRetries: 1 },
  });

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
