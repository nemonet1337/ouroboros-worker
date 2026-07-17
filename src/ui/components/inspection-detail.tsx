import type { FC } from "hono/jsx";
import type { InspectionResult, Recommendation } from "../../types";
import { ScoreGauge } from "./score-gauge";
import { ScoreBreakdown } from "./score-breakdown";
import { FindingsList } from "./findings-list";

interface InspectionDetailProps {
  result: InspectionResult & {
    proposal?: { summary: string; priority: string };
    pr?: { number: number; url: string };
    instruction?: string;
  };
  /** 提案アクション（propose/apply/dismiss）を出すために必要な inspection 行 ID */
  inspectionId?: string;
  /** inspections.status（completed / proposed / applied / dismissed） */
  status?: string;
}

const RecommendationCard: FC<{ rec: Recommendation }> = ({ rec }) => (
  <details class="collapse collapse-arrow bg-base-200/40 rounded-lg">
    <summary class="collapse-title text-sm font-semibold">{rec.title}</summary>
    <div class="collapse-content text-xs space-y-2">
      {rec.rationale && <p class="opacity-75">{rec.rationale}</p>}
      {rec.diff && (
        <pre class="bg-black/40 rounded-lg p-3 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre">
          {rec.diff}
        </pre>
      )}
      {rec.impactDescription && (
        <p class="opacity-60">
          <span class="font-semibold">影響:</span> {rec.impactDescription}
        </p>
      )}
    </div>
  </details>
);

/** 検査結果（スコアカード + 6 次元内訳 + 検出事項 + 改善提案 + リファクタ提案）の詳細表示。 */
export const InspectionDetail: FC<InspectionDetailProps> = ({ result, inspectionId, status }) => {
  const dimensions = Object.entries(result.scoreCard?.breakdown ?? {}).map(([label, dim]) => ({
    label,
    score: Math.round((dim as { score?: number }).score ?? 0),
    color: "",
  }));

  const recommendations = result.recommendations ?? [];
  const refactorCandidates = result.refactorCandidates ?? [];
  const proposal = result.proposal;
  const pr = result.pr;

  return (
    <div class="space-y-6" id={inspectionId ? `inspection-detail-${inspectionId}` : undefined}>
      <div class="card card-glass shadow-lg">
        <div class="card-body p-6">
          <div class="flex flex-col md:flex-row md:items-center gap-6">
            <ScoreGauge score={Math.round(result.scoreCard?.overall ?? 0)} grade={result.scoreCard?.grade} />
            <div class="flex-1 min-w-0 space-y-3">
              <div class="flex items-center gap-2 flex-wrap text-xs opacity-60">
                <span class="font-mono px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
                  {result.id.slice(0, 8)}
                </span>
                <span>{result.language}</span>
                {result.completedAt && (
                  <span>{new Date(result.completedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>
                )}
              </div>
              {result.summary && <p class="text-sm leading-relaxed opacity-85">{result.summary}</p>}
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-4">6 次元スコア内訳</h2>
            <ScoreBreakdown dimensions={dimensions} />
          </div>
        </div>

        <div class="space-y-3">
          <h2 class="text-lg font-bold opacity-75 px-1">検出事項 ({result.findings?.length ?? 0})</h2>
          <FindingsList
            findings={(result.findings ?? []).map((f) => ({
              id: f.id,
              category: f.category,
              severity: f.severity,
              title: f.title,
              description: f.description,
            }))}
          />
        </div>
      </div>

      {/* 改善提案（recommendations） */}
      {recommendations.length > 0 && (
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-4">
              改善提案 ({recommendations.length})
            </h2>
            <div class="space-y-2">
              {recommendations.slice(0, 20).map((rec) => (
                <RecommendationCard rec={rec} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* リファクタ候補 */}
      {refactorCandidates.length > 0 && (
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-4">
              リファクタリング候補 ({refactorCandidates.length})
            </h2>
            <div class="space-y-2 text-sm">
              {refactorCandidates.slice(0, 15).map((rc) => (
                <div class="flex items-center justify-between gap-3 border-b border-[var(--glass-border)]/30 pb-2">
                  <div class="min-w-0">
                    <div class="font-mono text-xs truncate">{rc.name}</div>
                    <div class="text-xs opacity-60">{rc.rationale}</div>
                  </div>
                  <span class="badge badge-sm rounded-full">{rc.priority}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* リファクタ提案の生成/適用/却下コントロール */}
      {inspectionId && (
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-2">リファクタリング提案</h2>

            {proposal ? (
              <div class="space-y-3">
                <div class="flex items-center gap-2">
                  <span class="badge badge-primary badge-sm rounded-full">{proposal.priority}</span>
                  {status && <span class="badge badge-sm rounded-full">{status}</span>}
                </div>
                <p class="text-sm opacity-85 leading-relaxed">{proposal.summary}</p>
                {pr && (
                  <a href={pr.url} target="_blank" class="link link-primary text-sm font-mono">
                    作成された PR: #{pr.number}
                  </a>
                )}
                {status === "proposed" && (
                  <div class="flex flex-wrap gap-2 pt-2">
                    <button
                      class="btn btn-sm btn-gradient rounded-lg gap-1"
                      hx-post={`/ui/fragments/refactor/${inspectionId}/apply`}
                      hx-target={`#inspection-detail-${inspectionId}`}
                      hx-swap="outerHTML"
                      hx-disabled-elt="this"
                    >
                      <i data-lucide="git-pull-request" class="w-3.5 h-3.5" />
                      <span>提案を適用（PR 作成）</span>
                    </button>
                    <button
                      class="btn btn-sm btn-outline rounded-lg gap-1"
                      hx-post={`/ui/fragments/refactor/${inspectionId}/dismiss`}
                      hx-target={`#inspection-detail-${inspectionId}`}
                      hx-swap="outerHTML"
                      hx-disabled-elt="this"
                    >
                      <i data-lucide="x" class="w-3.5 h-3.5" />
                      <span>却下</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div class="space-y-3">
                <p class="text-xs opacity-60">
                  この解析結果からリファクタリング提案を AI に生成させます。
                </p>
                <button
                  class="btn btn-sm btn-gradient rounded-lg gap-1"
                  hx-post={`/ui/fragments/refactor/${inspectionId}/propose`}
                  hx-target={`#inspection-detail-${inspectionId}`}
                  hx-swap="outerHTML"
                  hx-disabled-elt="this"
                >
                  <i data-lucide="sparkles" class="w-3.5 h-3.5" />
                  <span>リファクタ提案を生成</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
