import type { HealingRunRepository, HealingRunRow } from "../db/repositories";
import type { UsageSnapshot } from "../analytics/usage.accumulator";
import { mergeHealingSummary, parseHealingSummary, usageTotals, type HealingSummary } from "./summary";

export async function persistAnalyzeUsage(
  runs: HealingRunRepository,
  run: HealingRunRow,
  step: "index" | "analyze",
  snap: UsageSnapshot,
  model: string
): Promise<void> {
  const summary = parseHealingSummary(run.summary);
  const usage = { model: snap.model || model, promptTokens: snap.promptTokens, completionTokens: snap.completionTokens };
  if (step === "index") {
    summary.index = { ...(summary.index ?? { files: 0, chunks: 0 }), usage };
  } else {
    summary.analysis = {
      overall: 0,
      grade: "F",
      breakdown: {},
      findingCount: 0,
      autoFixableCount: 0,
      summary: "",
      ...summary.analysis,
      usage,
    };
  }
  const totals = usageTotals(summary);
  await runs.update(run.id, {
    summary: JSON.stringify(summary),
    model: totals.analyze.model || model,
    prompt_tokens: totals.analyze.promptTokens,
    completion_tokens: totals.analyze.completionTokens,
  });
}

export async function persistFixUsage(
  runs: HealingRunRepository,
  run: HealingRunRow,
  snap: UsageSnapshot,
  model: string
): Promise<void> {
  const usage = { model: snap.model || model, promptTokens: snap.promptTokens, completionTokens: snap.completionTokens };
  const summary = mergeHealingSummary(run.summary, { fix: { usage } });
  await runs.update(run.id, {
    summary,
    fix_model: usage.model,
    fix_prompt_tokens: usage.promptTokens,
    fix_completion_tokens: usage.completionTokens,
  });
}

export async function patchSummary(
  runs: HealingRunRepository,
  runId: string,
  patch: HealingSummary
): Promise<HealingRunRow | undefined> {
  const current = await runs.find(runId);
  if (!current) return undefined;
  await runs.update(runId, { summary: mergeHealingSummary(current.summary, patch) });
  return runs.find(runId);
}
