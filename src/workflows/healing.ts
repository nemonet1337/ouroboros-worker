import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
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

const STEP_OPTS_SCAN = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "10 minutes" as const,
};
const STEP_OPTS_ANALYZE = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "10 minutes" as const,
};
const STEP_OPTS_FIX = {
  retries: { limit: 2, delay: "30 seconds" as const, backoff: "exponential" as const },
  timeout: "15 minutes" as const,
};

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
      ctx.ports.vcs as unknown as GitHubProvider,
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
 * Durable, resumable self-healing lifecycle on Cloudflare.
 * scan / analyze / fix は同一 Worker 内の RepoRunner で実行する。
 */
export class HealingWorkflow extends WorkflowEntrypoint<Env, HealingParams> {
  async run(event: WorkflowEvent<HealingParams>, step: WorkflowStep): Promise<void> {
    const { runId } = event.payload;
    try {
      await this.execute(event, step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status !== "canceled") {
        await runs.update(runId, { status: "failed", summary: JSON.stringify({ error: message }) });
      }
      console.error(`[workflow] failed runId=${runId}`, message);
      throw err;
    }
  }

  private async execute(
    event: WorkflowEvent<HealingParams>,
    step: WorkflowStep
  ): Promise<void> {
    const { runId, dryRun } = event.payload;

    const findings = await step.do("scan", STEP_OPTS_SCAN, async (): Promise<AllFindings> => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status === "canceled") throw new Error("canceled");
      await runs.update(runId, { status: "scanning", workflow_id: event.instanceId });
      const r = await ctx.ports.runner.scan();
      return r.findings;
    });

    const analysis = await step.do("analyze", STEP_OPTS_ANALYZE, async () => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status === "canceled") throw new Error("canceled");
      await runs.update(runId, { status: "analyzing" });
      const run = await runs.find(runId);
      const model = await ctx.auth.resolveModel(run?.user_id);
      const config = { ...ctx.config, ai: { ...ctx.config.ai, model } };
      const codeContext = await buildCodeContext(ctx, findings);
      const result = await new AIAnalyzer(config, ctx.ports.ai).analyze(findings, codeContext);
      console.log(
        `[healing] scan complete score=${result.riskScore} groups=${result.groups.length} ${result.summary}`
      );
      return result;
    });

    await step.do("fix", STEP_OPTS_FIX, async () => {
      const ctx = await buildContext(this.env);
      const runs = new HealingRunRepository(ctx.ports.db);
      const current = await runs.find(runId);
      if (current?.status === "canceled") throw new Error("canceled");
      await runs.update(runId, { status: "fixing" });
      const dedup = new PRDeduplicator(ctx.config, ctx.ports.vcs);
      const cache = new FixCache(ctx.config, ctx.ports.vcs);
      const escalator = new Escalator(ctx.config, ctx.ports.vcs);

      if (!dryRun) await Promise.allSettled([dedup.loadOpenPRs(), cache.load()]);

      const run = await runs.find(runId);
      const healingModel = await ctx.auth.resolveModel(run?.user_id);

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
          model: healingModel,
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
            console.log(`[healing] PR #${pr.number} ${pr.url} group=${group.id} priority=${group.priority}`);
            prs.push({ number: pr.number, title: pr.title, branch: pr.branch, url: pr.url });
            prsCreated++;
          } catch (err) {
            await escalator.escalate(group, (err as Error).message);
          }
        } else {
          const reason = fix.validationOutput || "auto-fix failed";
          console.log(`[healing] fix failed group=${group.id}: ${reason.slice(0, 200)}`);
          await escalator.escalate(group, reason);
        }
      }

      await runs.update(runId, {
        status: "done",
        summary: JSON.stringify({ riskScore: analysis.riskScore, prsCreated, prs }),
      });
    });
  }
}
