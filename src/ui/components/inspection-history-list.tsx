import type { FC } from "hono/jsx";
import type { HistoryEntry } from "../../http/data";

interface InspectionHistoryListProps {
  history: HistoryEntry[];
}

const scoreColorClass = (score: number): string => {
  if (score >= 90) return "text-[#16A34A]";
  if (score >= 75) return "text-[#F6821F]";
  if (score >= 60) return "text-[#FAAE40]";
  return "text-[#FF4040]";
};

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  queued: { label: "待機中", class: "badge-warning" },
  indexing: { label: "インデックス中", class: "badge-info" },
  searching: { label: "検索中", class: "badge-info" },
  analyzing: { label: "解析中", class: "badge-info" },
  completed: { label: "完了", class: "badge-success" },
  proposed: { label: "提案あり", class: "badge-primary" },
  applied: { label: "適用済", class: "badge-success" },
  dismissed: { label: "却下", class: "badge-ghost" },
  failed: { label: "失敗", class: "badge-error" },
  canceled: { label: "キャンセル", class: "badge-ghost" },
};

const SCORED = new Set(["completed", "proposed", "applied", "dismissed"]);

/** コード解析のスキャン履歴（新しい順のコンパクトカード）。クリックで結果を左ペインに表示。 */
export const InspectionHistoryList: FC<InspectionHistoryListProps> = ({ history }) => {
  const newestFirst = [...history].reverse();

  return (
    <div
      id="inspection-history"
      hx-get="/ui/fragments/history"
      hx-trigger="every 5s"
      hx-swap="outerHTML"
    >
      {history.length === 0 ? (
        <div class="text-center text-base-content/50 py-4">
          <i data-lucide="history" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">スキャン履歴はありません</p>
          <p class="text-xs opacity-75 mt-1">左のフォームから最初の解析を実行してみましょう。</p>
        </div>
      ) : (
        <div class="space-y-3">
          {newestFirst.map((h) => {
            const st = STATUS_CONFIG[h.status] ?? { label: h.status, class: "badge-ghost" };
            const showScore = SCORED.has(h.status);
            return (
              <div
                key={h.id}
                role="button"
                tabindex={0}
                class="card card-glass p-4 flex flex-row items-center gap-4 border border-[var(--glass-border)] w-full text-left cursor-pointer hover:bg-base-200/40"
                hx-get={`/ui/fragments/inspections/${h.id}`}
                hx-target="#inspect-result"
                hx-swap="innerHTML"
              >
                <span class={`text-2xl font-black tracking-tight ${showScore ? scoreColorClass(h.overall) : "opacity-40"}`}>
                  {showScore ? h.overall : "—"}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class={`badge badge-sm rounded-full ${st.class}`}>{st.label}</span>
                    {h.target ? <span class="text-xs font-mono opacity-60 truncate">{h.target}</span> : null}
                  </div>
                  <div class="text-xs opacity-70 mt-1">
                    {new Date(h.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </div>
                  {showScore ? (
                    <div class="flex items-center gap-3 text-xs opacity-60 mt-1">
                      <span class="flex items-center gap-1">
                        <i data-lucide="shield" class="w-3 h-3" />
                        {h.security}
                      </span>
                      <span class="flex items-center gap-1">
                        <i data-lucide="zap" class="w-3 h-3" />
                        {h.performance}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
