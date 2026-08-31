import type { WorkerContext } from "../context";
import { HealingRunRepository } from "../db/repositories";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { FixCache } from "../utils/fix.cache";
import { Escalator } from "../utils/escalator";
import { buildPRBody, buildPRTitle } from "../pr/pr.body";
import type { FindingGroup, Priority } from "../types";
import { parseHealingSummary, type HealingSummaryPr } from "./summary";
import { persistFixUsage } from "./persist";
import { assertNotCanceled } from "./analyze";

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low", "info"];

export async function fixHealingRun(
  ctx: WorkerContext,
  runId: string,
  dryRun: boolean
): Promise<{ prsCreated: number }> {
  const runs = new HealingRunRepository(ctx.ports.db);
  await assertNotCanceled(runId, runs);
  await runs.update(runId, { status: "fixing" });

  const run = await runs.find(runId);
  if (!run) throw new Error("run not found");
  const summary = parseHealingSummary(run.summary);
  const groups = summary.groups ?? [];
  const model = await ctx.auth.resolveModel(run.user_id);

  const dedup = new PRDeduplicator(ctx.config, ctx.ports.vcs);
  const cache = new FixCache(ctx.config, ctx.ports.vcs);
  const escalator = new Escalator(ctx.config, ctx.ports.vcs);
  if (!dryRun) await Promise.allSettled([dedup.loadOpenPRs(), cache.load()]);

  const sorted = [...groups].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  let prsCreated = 0;
  const prs: HealingSummaryPr[] = [];
  for (const group of sorted) {
    if (prsCreated >= ctx.config.scan.maxPRsPerRun) break;
    if (!dryRun && (!group.autoFixable || cache.has(group) || dedup.isDuplicate(group))) {
      if (!group.autoFixable) await escalator.escalate(group);
      continue;
    }

    const fix = await ctx.ports.runner.applyFix({
      group,
      baseBranch: ctx.config.vcs.baseBranch,
      branchPrefix: ctx.config.vcs.branchPrefix,
      dryRun,
      model,
      contextLines: ctx.config.ai.contextLines,
    });

    if (dryRun) continue;

    if (fix.success && fix.branch && fix.patches.length > 0) {
      try {
        const pr = await ctx.ports.vcs.createPR({
          branch: fix.branch,
          baseBranch: ctx.config.vcs.baseBranch,
          title: buildPRTitle(group),
          body: buildPRBody(fix.patches, group, fix.iterations),
          labels: ["self-healing", group.priority, "automated-fix"],
        });
        dedup.register(pr.branch);
        await cache.record(group);
        prs.push({ number: pr.number, title: pr.title, branch: pr.branch, url: pr.url });
        prsCreated++;
      } catch (err) {
        await escalator.escalate(group, (err as Error).message);
      }
    } else {
      const reason = fix.validationOutput || "auto-fix failed";
      await escalator.escalate(group, reason);
    }
  }

  const latest = await runs.find(runId);
  if (latest) await persistFixUsage(runs, latest, ctx.usage.snapshot(), model);

  await runs.update(runId, {
    status: "done",
    summary: JSON.stringify({
      ...parseHealingSummary((await runs.find(runId))?.summary),
      prsCreated,
      prs,
    }),
  });

  return { prsCreated };
}

export function canStartFix(status: string, groups: FindingGroup[] | undefined): boolean {
  return status === "analyzed" && Array.isArray(groups);
}
