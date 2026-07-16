import type { FC } from "hono/jsx";
import type { HealingRunRow } from "../../db/repositories";

interface HealingRunListProps {
  runs: HealingRunRow[];
  /** true にすると hx-swap-oob 付きで出力され、別レスポンスに同梱してリストを差し替えられる */
  oob?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  queued: { label: "待機中", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  running: { label: "実行中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  done: { label: "完了", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed: { label: "失敗", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
};

const TRIGGER_LABELS: Record<string, string> = {
  api: "API",
  gui: "GUI",
  cron: "スケジュール",
};

/** 自己修復の実行履歴テーブル。 */
export const HealingRunList: FC<HealingRunListProps> = ({ runs, oob }) => {
  if (runs.length === 0) {
    return (
      <div id="healing-runs-list" hx-swap-oob={oob ? "true" : undefined}>
        <div class="card card-glass p-8 text-center text-base-content/50">
          <i data-lucide="wrench" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">修復実行履歴はありません</p>
          <p class="text-xs opacity-75 mt-1">手動トリガーまたはスケジュール実行されるとここに表示されます。</p>
        </div>
      </div>
    );
  }

  return (
    <div id="healing-runs-list" class="card card-glass shadow-lg overflow-x-auto" hx-swap-oob={oob ? "true" : undefined}>
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">実行 ID</th>
            <th class="p-3">トリガー</th>
            <th class="p-3">ステータス</th>
            <th class="p-3">バージョン</th>
            <th class="p-3">実行日時</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const status = STATUS_CONFIG[run.status] ?? { label: run.status, class: "badge-ghost" };
            return (
              <tr key={run.id} class="border-b border-[var(--glass-border)]/30">
                <td class="p-3 font-mono text-xs text-primary">{run.id.slice(0, 8)}</td>
                <td class="p-3 text-xs">{TRIGGER_LABELS[run.trigger] ?? run.trigger}</td>
                <td class="p-3">
                  <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
                </td>
                <td class="p-3 font-mono text-xs opacity-60">{run.tag ?? "—"}</td>
                <td class="p-3 text-xs opacity-70">
                  {new Date(run.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
