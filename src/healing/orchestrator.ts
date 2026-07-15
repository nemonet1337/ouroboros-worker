import type { Ports } from "../ports";
import type { VcsPullRequest } from "../ports/vcs";
import type { HealingConfig } from "../config/healing.config";
import type { Logger } from "../logging/logger";
import { Priority } from "../types";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { Notifier } from "../notifications/notifier";
import { AlertService } from "../notifications/alerts";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { PRMerger } from "../pr/pr.merger";
import { FixCache } from "../utils/fix.cache";
import { Escalator } from "../utils/escalator";
import { buildPRBody, buildPRTitle } from "../pr/pr.body";

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low", "info"];

export interface HealingCycleOptions {
  dryRun: boolean;
  maxPRs: number;
  assignees?: string[];
  alertRecipients?: string[];
  commitHash?: string;
}

export interface HealingCycleResult {
  riskScore: number;
  summary: string;
  groupsTotal: number;
  prsCreated: number;
  escalated: number;
  prs: VcsPullRequest[];
}

/**
 * Runtime-agnostic self-healing cycle: scan → AI analysis → fix → PR → notify.
 * All platform concerns are injected via `ports`, so the same logic runs in the
 * Node server (LocalRunner) and inside a Cloudflare Workflow (DispatchRunner).
 */
export async function runHealingCycle(
  ports: Ports,
  config: HealingConfig,
  logger: Logger,
  opts: HealingCycleOptions
): Promise<HealingCycleResult> {
  const log = logger.child("healing");
  const notifier = new Notifier(config);
  const alerts = new AlertService(ports.mailer, opts.alertRecipients ?? []);
  const result: HealingCycleResult = {
    riskScore: 0,
    summary: "",
    groupsTotal: 0,
    prsCreated: 0,
    escalated: 0,
    prs: [],
  };

  await log.info(opts.dryRun ? "starting cycle (DRY RUN)" : "starting cycle");

  // PHASE 1: scan (delegated to the runner — local or dispatched)
  const { findings } = await ports.runner.scan();
  await log.info("scan complete", {
    staticAnalysis: findings.staticAnalysis.length,
    dependency: findings.dependency.length,
    performance: findings.performance.length,
    secrets: findings.secrets.length,
  });

  // PHASE 2: AI analysis
  const analysis = await new AIAnalyzer(config, ports.ai).analyze(findings);
  result.riskScore = analysis.riskScore;
  result.summary = analysis.summary;
  result.groupsTotal = analysis.groups.length;

  await notifier.notifyScanComplete(analysis);
  await alerts.scanRisk(analysis);

  if (analysis.groups.length === 0) {
    await log.info("no actionable groups; done");
    return result;
  }
  await log.info("analysis complete", { groups: analysis.groups.length, risk: analysis.riskScore });

  // PHASE 3: fix loop
  const dedup = new PRDeduplicator(config, ports.vcs);
  const cache = new FixCache(config, ports.vcs);
  const escalator = new Escalator(config, ports.vcs, opts.assignees ?? [], opts.commitHash ?? "local");
  const merger = new PRMerger(config, ports.vcs, ports.ai);

  if (!opts.dryRun) {
    await Promise.allSettled([dedup.loadOpenPRs(), cache.load()]);
  }

  const sorted = [...analysis.groups].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  for (const group of sorted) {
    if (result.prsCreated >= opts.maxPRs) {
      await escalator.escalate(group, "PR 作成上限に達しました");
      result.escalated++;
      continue;
    }

    if (opts.dryRun) {
      const fix = await ports.runner.applyFix({
        group,
        baseBranch: config.vcs.baseBranch,
        branchPrefix: config.vcs.branchPrefix,
        dryRun: true,
      });
      for (const patch of fix.patches) await log.info(`[dry-run] ${patch.file}`, { diff: patch.diff.slice(0, 400) });
      continue;
    }

    if (!group.autoFixable) {
      await escalator.escalate(group);
      result.escalated++;
      continue;
    }
    if (cache.has(group) || dedup.isDuplicate(group)) {
      await log.info("skipping (cached/duplicate)", { group: group.id });
      continue;
    }

    const fix = await ports.runner.applyFix({
      group,
      baseBranch: config.vcs.baseBranch,
      branchPrefix: config.vcs.branchPrefix,
      dryRun: false,
    });

    if (fix.success && fix.branch && fix.patches.length > 0) {
      try {
        const pr = await ports.vcs.createPR({
          branch: fix.branch,
          baseBranch: config.vcs.baseBranch,
          title: buildPRTitle(group),
          body: buildPRBody(fix.patches, group, fix.iterations),
          labels: ["self-healing", group.priority, "automated-fix"],
        });
        dedup.register(pr.branch);
        await cache.record(group);
        await notifier.notifyPRCreated(pr, group);
        result.prs.push(pr);
        result.prsCreated++;
        await log.info("PR created", { number: pr.number, url: pr.url });

        if (config.autoMerge.enabled) {
          const merged = await merger.mergeIfEligible(pr.number);
          await notifier.notifyMerged(pr.number, merged);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await log.error("PR creation failed", { group: group.id, reason });
        await notifier.notifyFixFailed(group, reason);
        await alerts.fixFailed(group, reason);
        await escalator.escalate(group, reason);
        result.escalated++;
      }
    } else {
      const reason = fix.validationOutput || "自動修正に失敗しました";
      await log.warn("fix failed", { group: group.id, reason: reason.slice(0, 200) });
      await notifier.notifyFixFailed(group, reason);
      await alerts.fixFailed(group, reason);
      await escalator.escalate(group, reason);
      result.escalated++;
    }
  }

  await log.info("cycle done", { prsCreated: result.prsCreated, escalated: result.escalated });
  return result;
}
