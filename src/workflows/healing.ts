import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { AlertService } from "../notifications/alerts";
import { Notifier } from "../notifications/notifier";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { FixCache } from "../utils/fix.cache";
import { Escalator } from "../utils/escalator";
import { HealingRunRepository } from "../db/repositories";
import { buildPRBody, buildPRTitle } from "../pr/pr.body";
import type { AllFindings, Priority } from "../types";
import type { Env } from "../env";
import { buildContext } from "../context";

export interface HealingParams {
  runId: string;
  dryRun: boolean;
  trigger: string;
}

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low", "info"];

/**
 * Durable, resumable self-healing lifecycle on Cloudflare. Each phase is a
 * Workflow step (retried independently); heavy git/compiler work is dispatched
 * to the self-hosted runner via the DispatchRunner inside the fix step.
 */
export class HealingWorkflow extends WorkflowEntrypoint<Env, HealingParams> {
  async run(event: WorkflowEvent<HealingParams>, step: WorkflowStep): Promise<void> {
    const ctx = buildContext(this.env);
    const runs = new HealingRunRepository(ctx.ports.db);
    const { runId, dryRun } = event.payload;
    const log = ctx.logger.child("workflow");

    const findings = await step.do("scan", async (): Promise<AllFindings> => {
      await runs.update(runId, { status: "scanning", workflow_id: event.instanceId });
      const r = await ctx.ports.runner.scan();
      return r.findings;
    });

    const analysis = await step.do("analyze", async () => {
      await runs.update(runId, { status: "analyzing" });
      const result = await new AIAnalyzer(ctx.config, ctx.ports.ai).analyze(findings);
      await new Notifier(ctx.config).notifyScanComplete(result);
      await new AlertService(ctx.ports.mailer, ctx.alertRecipients).scanRisk(result);
      return result;
    });

    await step.do("fix", async () => {
      await runs.update(runId, { status: "fixing" });
      const dedup = new PRDeduplicator(ctx.config, ctx.ports.vcs);
      const cache = new FixCache(ctx.config, ctx.ports.vcs);
      const escalator = new Escalator(ctx.config, ctx.ports.vcs);
      const notifier = new Notifier(ctx.config);
      const alerts = new AlertService(ctx.ports.mailer, ctx.alertRecipients);

      if (!dryRun) await Promise.allSettled([dedup.loadOpenPRs(), cache.load()]);

      const sorted = [...analysis.groups].sort(
        (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
      );

      let prsCreated = 0;
      const prs: number[] = [];
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
            await notifier.notifyPRCreated(pr, group);
            prs.push(pr.number);
            prsCreated++;
          } catch (err) {
            await escalator.escalate(group, (err as Error).message);
          }
        } else {
          const reason = fix.validationOutput || "auto-fix failed";
          await notifier.notifyFixFailed(group, reason);
          await alerts.fixFailed(group, reason);
          await escalator.escalate(group, reason);
        }
      }

      await runs.update(runId, {
        status: "done",
        summary: JSON.stringify({ riskScore: analysis.riskScore, prsCreated, prs }),
      });
      await log.info("workflow cycle done", { runId, prsCreated });
    });
  }
}
