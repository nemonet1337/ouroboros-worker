import type { FC } from "hono/jsx";
import type { MetricsData } from "../../http/data";
import { MetricsCards } from "./metrics-cards";
import { ScoreGauge } from "./score-gauge";
import { PRHistory } from "./pr-history";
import { DependencyChanges } from "./dependency-changes";

interface MetricsDashboardProps {
  data: MetricsData;
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  done: { label: "完了", class: "badge-success" },
  running: { label: "実行中", class: "badge-info" },
  queued: { label: "待機中", class: "badge-warning" },
  failed: { label: "失敗", class: "badge-error" },
};

/** ダッシュボードのメトリクス一式（統計カード + ヘルススコア + 修復アクティビティ + PR 履歴）。 */
export const MetricsDashboard: FC<MetricsDashboardProps> = ({ data }) => {
  const lastRunStatus = data.lastRun ? STATUS_LABELS[data.lastRun.status] : undefined;

  return (
    <div id="metrics-container" class="space-y-8">
      <MetricsCards
        metrics={[
          { label: "総スキャン回数", value: data.inspectionCount, icon: "scan-search" },
          { label: "平均スコア", value: data.avgOverall, icon: "activity" },
          { label: "自己修復実行回数", value: data.healingRuns, icon: "wrench" },
        ]}
      />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="card card-glass shadow-lg col-span-1">
          <div class="card-body items-center p-6">
            <h2 class="card-title text-lg font-bold opacity-75">現在のヘルススコア</h2>
            <ScoreGauge score={data.latestOverall} />
            <p class="text-xs opacity-50 text-center">
              リスクスコア: <span class="font-bold">{data.riskScore}</span>
            </p>
          </div>
        </div>

        <div class="card card-glass shadow-lg col-span-1 lg:col-span-2">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75">最近の修復アクティビティ</h2>
            {data.lastRun ? (
              <div class="mt-4 space-y-3 text-sm">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <span class="font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
                    {data.lastRun.id.slice(0, 8)}
                  </span>
                  <span class={`badge badge-sm rounded-full font-bold ${lastRunStatus?.class ?? "badge-ghost"}`}>
                    {lastRunStatus?.label ?? data.lastRun.status}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-xs opacity-70">
                  <i data-lucide="clock" class="w-3.5 h-3.5" />
                  <span>
                    {new Date(data.lastRun.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </span>
                  <span class="opacity-50">トリガー: {data.lastRun.trigger}</span>
                </div>
                <a href="/healing" class="link link-primary text-xs flex items-center gap-1">
                  <i data-lucide="arrow-right" class="w-3.5 h-3.5" />
                  <span>修復履歴をすべて見る</span>
                </a>
              </div>
            ) : (
              <div class="text-center py-8 text-base-content/50">
                <i data-lucide="wrench" class="w-10 h-10 mx-auto text-base-content/30 mb-2" />
                <p class="font-bold text-sm">修復アクティビティはまだありません</p>
                <p class="text-xs opacity-75 mt-1">自己修復サイクルが実行されるとここに表示されます。</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div class="card card-glass shadow-lg">
        <div class="card-body p-6">
          <h2 class="card-title text-lg font-bold opacity-75 mb-2">自動生成 PR 履歴</h2>
          <PRHistory
            items={data.prHistory.map((pr) => ({
              number: pr.number,
              title: pr.title,
              branch: pr.branch,
              status: pr.status,
              created_at: pr.date,
            }))}
          />
        </div>
      </div>

      {data.dependencyChanges.length > 0 && (
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold opacity-75 mb-2">依存関係の更新</h2>
            <DependencyChanges
              changes={data.dependencyChanges.map((d) => ({
                name: d.name,
                current: d.before,
                latest: d.after,
                updateType: d.type,
                breaking: d.type === "major",
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
};
