import type { WorkerContext } from "../context";
import { HealingRunRepository, InspectionRepository } from "../db/repositories";
import type { GitHubProvider } from "../vcs/github.provider";
import { InspectionEngine } from "../inspection/inspection.engine";
import { defaultInspectionConfig } from "../config/inspection.config";
import { detectLanguage, MAX_ANALYSIS_FILES } from "../inspection/pipeline";
import { selectPathsForAnalysis } from "../code/context.assembler";
import { newId } from "../auth/tokens";
import type { AllFindings, InspectionRequest, InspectionResult } from "../types";
import { groupsFromAnalysis } from "./groups.from.analysis";
import { healingInspectionTarget } from "./status";
import { parseHealingSummary } from "./summary";
import { patchSummary, persistAnalyzeUsage } from "./persist";

const ANALYSIS_QUERY = "コード全体の品質・セキュリティ・パフォーマンス上の問題";

export async function assertNotCanceled(runId: string, runs: HealingRunRepository): Promise<void> {
  const current = await runs.find(runId);
  if (current?.status === "canceled") throw new Error("canceled");
}

export async function scanHealingRun(ctx: WorkerContext, runId: string): Promise<AllFindings> {
  const runs = new HealingRunRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "scanning" });
  const r = await ctx.ports.runner.scan();
  return r.findings;
}

export async function inspectHealingRun(
  ctx: WorkerContext,
  runId: string,
  findings: AllFindings,
  instruction?: string
): Promise<{ inspectionId: string; overall: number; groups: number }> {
  const runs = new HealingRunRepository(ctx.ports.db);
  const inspections = new InspectionRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "analyzing" });

  const run = await runs.find(runId);
  if (!run) throw new Error("run not found");
  const userId = run.user_id || "cron";
  const model = await ctx.auth.resolveModel(run.user_id);
  const vcs = ctx.ports.vcs as unknown as GitHubProvider;

  let files: Array<{ path: string; content: string }> = [];
  const query = instruction?.trim() || ANALYSIS_QUERY;
  if (typeof vcs.getRepoFiles === "function") {
    try {
      const repo = await vcs.getRepoFiles(MAX_ANALYSIS_FILES * 4);
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
      if (files.length === 0) {
        files = repo.slice(0, MAX_ANALYSIS_FILES).map((f) => ({ path: f.path, content: f.content }));
      }
    } catch (err) {
      console.warn("[healing] related file selection failed:", err instanceof Error ? err.message : err);
      files = typeof vcs.getRepoFiles === "function"
        ? (await vcs.getRepoFiles(MAX_ANALYSIS_FILES)).slice(0, MAX_ANALYSIS_FILES)
        : [];
    }
  }

  let inspection: InspectionResult | null = null;
  if (files.length > 0) {
    const req: InspectionRequest = {
      id: newId(),
      language: detectLanguage(files.map((f) => f.path)),
      files: files.map((f) => ({ path: f.path, content: f.content })),
      requestedAt: new Date().toISOString(),
      projectContext: instruction?.trim() || undefined,
    };
    const engine = new InspectionEngine(ctx.ports.ai, {
      ai: { ...defaultInspectionConfig.ai, model, maxRetries: 1 },
    });
    inspection = await engine.inspect(req);
  }

  const groups = groupsFromAnalysis(inspection, findings);
  const inspectionId = newId();
  const breakdown: Record<string, number> = {};
  if (inspection?.scoreCard.breakdown) {
    for (const [key, dim] of Object.entries(inspection.scoreCard.breakdown)) {
      breakdown[key] = Math.round(dim.score);
    }
  }
  const analysis = {
    overall: Math.round(inspection?.scoreCard.overall ?? 0),
    grade: inspection?.scoreCard.grade ?? "F",
    breakdown,
    findingCount: groups.reduce((n, g) => n + g.findings.length, 0),
    autoFixableCount: groups.filter((g) => g.autoFixable).length,
    summary: inspection?.summary ?? (groups.length === 0 ? "問題は検出されませんでした。" : `検出 ${groups.length} グループ`),
    instruction: instruction?.trim() || undefined,
  };

  const trimmedInstruction = instruction?.trim() || undefined;
  const resultPayload = inspection
    ? { ...inspection, healingGroups: groups, instruction: trimmedInstruction }
    : {
        id: inspectionId,
        summary: analysis.summary,
        scoreCard: null,
        findings: [],
        healingGroups: groups,
        instruction: trimmedInstruction,
      };

  await inspections.insert({
    id: inspectionId,
    user_id: userId,
    target: healingInspectionTarget(runId),
    result: JSON.stringify(resultPayload),
    status: "completed",
    progress: null,
    created_at: Date.now(),
  });

  const latest = await runs.find(runId);
  if (latest) await persistAnalyzeUsage(runs, latest, "analyze", ctx.usage.snapshot(), model);

  const afterUsage = await runs.find(runId);
  const prev = parseHealingSummary(afterUsage?.summary);
  await runs.update(runId, {
    status: "analyzed",
    inspection_id: inspectionId,
    model,
    summary: JSON.stringify({
      ...prev,
      analysis: { ...analysis, usage: prev.analysis?.usage },
      groups,
    }),
  });

  return { inspectionId, overall: analysis.overall, groups: groups.length };
}
