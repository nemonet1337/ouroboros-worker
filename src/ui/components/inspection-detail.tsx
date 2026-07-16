import type { FC } from "hono/jsx";
import type { InspectionResult } from "../../types";
import { ScoreGauge } from "./score-gauge";
import { ScoreBreakdown } from "./score-breakdown";
import { FindingsList } from "./findings-list";

interface InspectionDetailProps {
  result: InspectionResult;
}

/** 検査結果（スコアカード + 6 次元内訳 + 検出事項）の詳細表示。 */
export const InspectionDetail: FC<InspectionDetailProps> = ({ result }) => {
  const dimensions = Object.entries(result.scoreCard?.breakdown ?? {}).map(([label, dim]) => ({
    label,
    score: Math.round((dim as { score?: number }).score ?? 0),
    color: "",
  }));

  return (
    <div class="space-y-6">
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
    </div>
  );
};
