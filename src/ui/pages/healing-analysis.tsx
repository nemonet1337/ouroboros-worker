import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { HealingRunRow } from "../../db/repositories";
import type { InspectionResult } from "../../types";
import { Layout } from "../layout";
import { RadarChart } from "../components/radar-chart";
import { ScoreGauge } from "../components/score-gauge";
import { ScoreBreakdown } from "../components/score-breakdown";
import { FindingsList } from "../components/findings-list";
import { HealingFixModalShell } from "../components/healing-fix-modal";
import { HEALING_STATUS_LABELS, HEALING_TRIGGER_LABELS } from "../../healing/status";
import { parseHealingSummary } from "../../healing/summary";

interface HealingAnalysisPageProps {
  user?: AuthedUser;
  run: HealingRunRow;
  result: (InspectionResult & { healingGroups?: unknown }) | null;
}

export const HealingAnalysisPage: FC<HealingAnalysisPageProps> = ({ user, run, result }) => {
  const summary = parseHealingSummary(run.summary);
  const status = HEALING_STATUS_LABELS[run.status] ?? { label: run.status, class: "badge-ghost" };
  const breakdown = summary.analysis?.breakdown ?? {};
  const dimensions = Object.entries(breakdown).map(([label, score]) => ({
    label,
    score: Math.round(score),
    color: "",
  }));
  const prs = (summary.prs ?? []).map((p) => (typeof p === "number" ? { number: p } : p));
  const findings = result?.findings ?? [];

  return (
    <Layout user={user}>
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <a href="/healing" class="btn btn-ghost btn-sm rounded-lg gap-1">
          <i data-lucide="arrow-left" class="w-4 h-4" />
          履歴へ戻る
        </a>
        <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
        <span class="text-xs opacity-50">{HEALING_TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
        <span class="font-mono text-xs opacity-40">{run.id}</span>
      </div>

      <div id="healing-result" class="mb-4 empty:hidden"></div>

      <div class="card card-glass shadow-lg mb-8">
        <div class="card-body p-6">
          <div class="flex flex-col lg:flex-row lg:items-center gap-6">
            <ScoreGauge
              score={Math.round(summary.analysis?.overall ?? result?.scoreCard?.overall ?? 0)}
              grade={summary.analysis?.grade ?? result?.scoreCard?.grade}
            />
            <div class="flex-1 min-w-0 space-y-3">
              <h1 class="text-2xl font-extrabold tracking-tight">解析結果</h1>
              {summary.analysis?.summary || result?.summary ? (
                <p class="text-sm leading-relaxed opacity-85">{summary.analysis?.summary ?? result?.summary}</p>
              ) : (
                <p class="text-sm opacity-50">解析サマリはまだありません。</p>
              )}
              <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs opacity-70 font-mono">
                <span>
                  解析モデル: {(run.model ?? "—").replace(/^@[^/]+\//, "")} · in {run.prompt_tokens ?? 0} / out{" "}
                  {run.completion_tokens ?? 0}
                </span>
                {(run.fix_model || run.fix_prompt_tokens) && (
                  <span>
                    修復モデル: {(run.fix_model ?? "—").replace(/^@[^/]+\//, "")} · in {run.fix_prompt_tokens ?? 0} / out{" "}
                    {run.fix_completion_tokens ?? 0}
                  </span>
                )}
                {summary.index && (
                  <span>
                    インデックス: {summary.index.files} files / {summary.index.chunks} chunks
                    {summary.index.error ? ` （${summary.index.error}）` : ""}
                  </span>
                )}
              </div>
              {run.status === "analyzed" && (
                <button
                  type="button"
                  class="btn btn-gradient rounded-xl"
                  {...{
                    "hx-get": `/ui/fragments/healing/${run.id}/fix-modal`,
                    "hx-target": "#healing-fix-modal-body",
                    "hx-swap": "innerHTML",
                    "hx-on::before-request": "document.getElementById('healing_fix_modal')?.showModal()",
                    "hx-on::after-request": "if(window.lucide) lucide.createIcons()",
                  }}
                >
                  <i data-lucide="wrench" class="w-4 h-4" />
                  修復を開始
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start mb-8">
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-2">6 次元レーダー</h2>
            <RadarChart scores={breakdown} />
          </div>
        </div>
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-4">スコア内訳</h2>
            {dimensions.length > 0 ? (
              <ScoreBreakdown dimensions={dimensions} />
            ) : (
              <p class="text-sm opacity-50">スコア内訳はまだありません。</p>
            )}
          </div>
        </div>
      </div>

      <div class="mb-8">
        <h2 class="text-lg font-bold opacity-75 px-1 mb-3">検出事項 ({findings.length})</h2>
        <FindingsList
          findings={findings.map((f) => ({
            id: f.id,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
          }))}
        />
      </div>

      {prs.length > 0 && (
        <div class="card card-glass shadow-lg mb-8">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-3">作成された PR</h2>
            <ul class="space-y-2 text-sm">
              {prs.map((pr) => (
                <li>
                  {pr.url ? (
                    <a href={pr.url} target="_blank" class="link link-primary font-mono">
                      #{pr.number}
                    </a>
                  ) : (
                    <span class="font-mono">#{pr.number}</span>
                  )}
                  {pr.title && <span class="opacity-70"> {pr.title}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {summary.error && (
        <div class="alert alert-error rounded-xl text-sm">{summary.error}</div>
      )}

      <HealingFixModalShell />
    </Layout>
  );
};
export { HealingAnalysisPageProps };
