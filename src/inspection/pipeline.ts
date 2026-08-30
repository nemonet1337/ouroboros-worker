/**
 * 選択リポジトリの非同期コード解析パイプライン。
 */
import type { WorkerContext } from "../context";
import type { Logger } from "../logging/logger";
import { InspectionRepository, SettingsRepository } from "../db/repositories";
import { CodeIndexer, CODE_INDEX_STATUS_KEY, type CodeIndexStatus } from "../vectorize/code.indexer";
import type { GitHubProvider } from "../vcs/github.provider";
import { InspectionEngine } from "../inspection/inspection.engine";
import { defaultInspectionConfig } from "../config/inspection.config";
import type { InspectionRequest, Language } from "../types";
import { newId } from "../auth/tokens";

const INDEX_STALE_MS = 24 * 60 * 60 * 1000; // 24 時間（同期 reindex を避ける）
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

export async function runInspectionPipeline(opts: RunAnalysisOptions): Promise<void> {
  const { ctx, log, inspectionId, userId, instruction } = opts;
  const inspections = new InspectionRepository(ctx.ports.db);
  const settings = new SettingsRepository(ctx.ports.db);
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

    const vectorize = ctx.ports.vectorize;
    const vcs = ctx.ports.vcs as unknown as GitHubProvider;

    if (!vectorize || !ctx.ports.ai.embed) {
      if (!(await push("analyzing", "Vectorize 未設定のため、リポジトリのファイルを直接解析します。", "analyzing"))) {
        return;
      }
      const files = await vcs.getRepoFiles(MAX_ANALYSIS_FILES);
      await analyzeAndStore({ ctx, inspections, inspectionId, userId, instruction, files, steps });
      return;
    }

    const indexer = new CodeIndexer(vectorize, ctx.ports.ai, vcs, settings);

    // 1. indexing — stale なら非同期 reindex を enqueue し、既存インデックスのまま続行
    const currentStatus = await indexer.getStatus();
    let indexReady = !needsReindex(currentStatus) && currentStatus?.status === "done";
    if (needsReindex(currentStatus)) {
      // 同期 reindex は subrequest を食い潰すため Queue へ委譲
      await ctx.ports.queue.send({
        id: newId(),
        type: "codeindex.requested",
        userId,
        payload: {},
        enqueuedAt: Date.now(),
      });
      if (currentStatus?.status === "done") {
        if (!(await push("indexing", "インデックスが古いため再構築をキューに登録しました。既存インデックスで検索を続行します。", "indexing"))) {
          return;
        }
        indexReady = true;
      } else {
        if (!(await push("indexing", "コードインデックス未構築のため再構築をキューに登録しました。代表ファイルを直接解析します。", "indexing"))) {
          return;
        }
        indexReady = false;
      }
    } else {
      if (!(await push("indexing", "既存のコードインデックスを使用します。", "indexing"))) return;
      indexReady = true;
    }

    // 2. searching
    let targetPaths: string[] = [];
    if (indexReady) {
      if (!(await push("searching", "関連するコードを Vectorize で検索しています…", "searching"))) return;
      const query = instruction.trim() || "コード全体の品質・セキュリティ・パフォーマンス上の問題";
      const snippets = await indexer.search(query, 12);
      targetPaths = uniqueTopPaths(
        snippets.map((s) => s.file),
        MAX_ANALYSIS_FILES
      );
      if (
        !(await push(
          "searching",
          snippets.length > 0
            ? `関連チャンク ${snippets.length} 件を取得（対象ファイル: ${targetPaths.join(", ") || "なし"}）。`
            : "関連チャンクが見つからなかったため代表ファイルを解析します。",
          "searching"
        ))
      ) {
        return;
      }
    } else {
      if (!(await push("searching", "インデックス未構築のため、代表ファイルを直接解析します。", "searching"))) {
        return;
      }
    }

    if (await isCanceled()) return;

    // 3. analyzing
    if (!(await push("analyzing", "AI によるコード解析を実行しています…", "analyzing"))) return;
    let files: Array<{ path: string; content: string }> = [];
    if (targetPaths.length > 0) {
      for (const path of targetPaths.slice(0, MAX_ANALYSIS_FILES)) {
        const file = await vcs.readFileContent(path);
        if (file) files.push({ path: file.path, content: file.content });
      }
    }
    if (files.length === 0) {
      files = (await vcs.getRepoFiles(MAX_ANALYSIS_FILES)).slice(0, MAX_ANALYSIS_FILES);
    }

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
    id: newId(),
    language,
    files: files.map((f) => ({ path: f.path, content: f.content })),
    requestedAt: new Date().toISOString(),
  };

  const model = await ctx.auth.resolveModel(userId, "inspection");
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
