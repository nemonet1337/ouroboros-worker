import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { AlertService } from "../notifications/alerts";
import { Notifier } from "../notifications/notifier";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { FixCache } from "../utils/fix.cache";
import { Escalator } from "../utils/escalator";
import { HealingRunRepository, SettingsRepository } from "../db/repositories";
import { buildPRBody, buildPRTitle } from "../pr/pr.body";
import type { AllFindings, Priority } from "../types";
import type { Env } from "../env";
import { buildContext, type WorkerContext } from "../context";
import { CodeIndexer } from "../vectorize/code.indexer";
import type { GitHubProvider } from "../vcs/github.provider";

export interface HealingParams {
  runId: string;
  dryRun: boolean;
  trigger: string;
}

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low", "info"];

/**
 * Vectorize コードインデックスから findings に関連するスニペットを検索し、
 * AIAnalyzer のプロンプトへ渡す追加コンテキストを組み立てる。エラーは非致命。
 */
async function buildCodeContext(ctx: WorkerContext, findings: AllFindings): Promise<string | undefined> {
  if (!ctx.ports.vectorize || !ctx.ports.ai.embed) return undefined;
  try {
    const top = [...findings.staticAnalysis, ...findings.secrets].slice(0, 10);
    if (top.length === 0) return undefined;
    const query = top
      .map((f) => `${"file" in f ? f.file : ""} ${"message" in f ? f.message : ""}`)
      .join("\n")
      .slice(0, 1500);

    const indexer = new CodeIndexer(
      ctx.ports.vectorize,
      ctx.ports.ai,
      ctx.ports.vcs as GitHubProvider,
      new SettingsRepository(ctx.ports.db)
    );
    const snippets = await indexer.search(query, 8);
    if (snippets.length === 0) return undefined;
    return snippets
      .map((s) => `### ${s.file}:${s.startLine}-${s.endLine}\n${s.text}`)
      .join("\n\n");
  } catch (err) {
    console.warn("[workflow] code context lookup failed:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/**
 * Durable, resumable self-healing lifecycle on Cloudflare. Each phase is a
 * Workflow step (retried independently); heavy git/compiler work is dispatched
 * to the self-hosted runner via the DispatchRunner inside the fix step.
 */
export class HealingWorkflow extends WorkflowEntrypoint<Env, HealingParams> {
  async run(event: WorkflowEvent<HealingParams>, step: WorkflowStep): Promise<void> {
    const ctx = await buildContext(this.env);
    const runs = new HealingRunRepository(ctx.ports.db);
    const { runId } = event.payload;
    const log = ctx.logger.child("workflow");
    const runLog = ctx.logger.child(`healing/${runId}`);

    try {
      await this.execute(event, step, ctx, runs);
    } catch (err) {
      // 失敗を healing_runs に記録して UI に表示させる（従来は findings 0 件の偽成功だった）
      const message = err instanceof Error ? err.message : String(err);
      await runs.update(runId, { status: "failed", summary: JSON.stringify({ error: message }) });
      await log.error("workflow failed", { runId, reason: message });
      await runLog.error("workflow failed", { reason: message });
      throw err;
    }
  }

  private async execute(
    event: WorkflowEvent<HealingParams>,
    step: WorkflowStep,
    ctx: Awaited<ReturnType<typeof buildContext>>,
    runs: HealingRunRepository
  ): Promise<void> {
    const { runId, dryRun } = event.payload;
    const log = ctx.logger.child("workflow");
    const runLog = ctx.logger.child(`healing/${runId}`);

    const findings = await step.do("scan", async (): Promise<AllFindings> => {
      await runs.update(runId, { status: "scanning", workflow_id: event.instanceId });
      await runLog.info("scan: 開始");
      const r = await ctx.ports.runner.scan();
      await runLog.info("scan: 完了", { groups: r.findings.staticAnalysis.length + r.findings.secrets.length });
      return r.findings;
    });

    const analysis = await step.do("analyze", async () => {
      await runs.update(runId, { status: "analyzing" });
      await runLog.info("analyze: 開始");
      // healing モードのモデルをトリガーしたユーザー設定から解決（cron 等はデフォルト）
      const run = await runs.find(runId);
      const model = await ctx.auth.resolveModel(run?.user_id, "healing");
      const config = { ...ctx.config, ai: { ...ctx.config.ai, model } };
      const codeContext = await buildCodeContext(ctx, findings);
      const result = await new AIAnalyzer(config, ctx.ports.ai).analyze(findings, codeContext);
      await new Notifier(ctx.config).notifyScanComplete(result);
      await new AlertService(ctx.ports.mailer, ctx.alertRecipients).scanRisk(result);
      await runLog.info("analyze: 完了", { riskScore: result.riskScore });
      return result;
    });

    await step.do("fix", async () => {
      await runs.update(runId, { status: "fixing" });
      await runLog.info("fix: 開始");
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
      const prs: Array<{ number: number; title: string; branch: string; url: string }> = [];
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
            prs.push({ number: pr.number, title: pr.title, branch: pr.branch, url: pr.url });
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
      await runLog.info("fix: 完了", { prsCreated });
    });
  }
}
