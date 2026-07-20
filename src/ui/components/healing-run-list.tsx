import type { FC } from "hono/jsx";
import type { HealingRunRow } from "../../db/repositories";

interface HealingRunListProps {
  runs: HealingRunRow[];
  /** true にすると hx-swap-oob 付きで出力され、別レスポンスに同梱してリストを差し替えられる */
  oob?: boolean;
}

interface HealingSummaryPr {
  number: number;
  title?: string;
  branch?: string;
  url?: string;
}

interface HealingSummary {
  riskScore?: number;
  prsCreated?: number;
  prs?: Array<HealingSummaryPr | number>;
  error?: string;
}

function parseSummary(raw: string | null): HealingSummary | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as HealingSummary) : null;
  } catch {
    return null;
  }
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  queued: { label: "待機中", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  scanning: { label: "スキャン中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  analyzing: { label: "解析中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  fixing: { label: "修復中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
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
    <div class="card card-glass shadow-lg overflow-x-auto" id="healing-runs-list" hx-swap-oob={oob ? "true" : undefined}>
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">実行 ID</th>
            <th class="p-3">トリガー</th>
            <th class="p-3">ステータス</th>
            <th class="p-3">結果</th>
            <th class="p-3">バージョン</th>
            <th class="p-3">実行日時</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const status = STATUS_CONFIG[run.status] ?? { label: run.status, class: "badge-ghost" };
            const summary = parseSummary(run.summary);
            const prs = (summary?.prs ?? []).map((p) =>
              typeof p === "number" ? ({ number: p } as HealingSummaryPr) : p
            );
            return (
              <tr key={run.id} class="border-b border-[var(--glass-border)]/30 align-top">
                <td class="p-3 font-mono text-xs">
                  <button
                    class="link link-primary"
                    hx-get={`/ui/fragments/healing/runs/${run.id}/logs`}
                    hx-target="#healing-log-modal-body"
                    hx-swap="innerHTML"
                    onclick="healing_log_modal.showModal()"
                  >
                    {run.id.slice(0, 8)}
                  </button>
                </td>
                <td class="p-3 text-xs">{TRIGGER_LABELS[run.trigger] ?? run.trigger}</td>
                <td class="p-3">
                  <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
                </td>
                <td class="p-3 text-xs">
                  {run.status === "failed" && summary?.error ? (
                    <span class="text-rose-400">{summary.error}</span>
                  ) : run.status === "done" ? (
                    <div class="space-y-1">
                      {summary?.riskScore !== undefined && (
                        <div class="opacity-70">
                          リスクスコア: <span class="font-bold">{summary.riskScore}</span>
                        </div>
                      )}
                      {prs.length > 0 ? (
                        <details class="collapse collapse-arrow bg-base-200/40 rounded-lg">
                          <summary class="collapse-title min-h-0 py-1 px-2 text-xs font-semibold">
                            作成 PR: {prs.length} 件
                          </summary>
                          <div class="collapse-content px-2 space-y-1">
                            {prs.map((pr) => (
                              <div class="text-xs">
                                {pr.url ? (
                                  <a href={pr.url} target="_blank" class="link link-primary font-mono">
                                    #{pr.number}
                                  </a>
                                ) : (
                                  <span class="font-mono">#{pr.number}</span>
                                )}
                                {pr.title && <span class="opacity-70"> {pr.title}</span>}
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <span class="opacity-50">PR なし</span>
                      )}
                    </div>
                  ) : (
                    <span class="opacity-40">—</span>
                  )}
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
      <dialog id="healing-log-modal" class="modal">
        <div class="modal-box max-w-3xl">
          <h3 class="font-bold text-lg mb-4">修復実行ログ</h3>
          <div id="healing-log-modal-body" class="empty:hidden"></div>
          <div class="modal-action">
            <form method="dialog">
              <button class="btn btn-sm">閉じる</button>
            </form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button>閉じる</button>
        </form>
      </dialog>
    </div>
  );
};
