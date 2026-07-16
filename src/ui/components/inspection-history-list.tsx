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

/** コード解析のスキャン履歴（新しい順のコンパクトカード）。 */
export const InspectionHistoryList: FC<InspectionHistoryListProps> = ({ history }) => {
  if (history.length === 0) {
    return (
      <div class="card card-glass p-8 text-center text-base-content/50">
        <i data-lucide="history" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
        <p class="font-bold">スキャン履歴はありません</p>
        <p class="text-xs opacity-75 mt-1">左のフォームから最初の解析を実行してみましょう。</p>
      </div>
    );
  }

  // API と同じく oldest → newest で受け取るため、表示は新しい順に反転する
  const newestFirst = [...history].reverse();

  return (
    <div class="space-y-3">
      {newestFirst.map((h) => (
        <div
          key={h.id}
          class="card card-glass p-4 flex flex-row items-center gap-4 border border-[var(--glass-border)]"
        >
          <span class={`text-2xl font-black tracking-tight ${scoreColorClass(h.overall)}`}>{h.overall}</span>
          <div class="flex-1 min-w-0">
            <div class="text-xs opacity-70">{h.date}</div>
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
          </div>
        </div>
      ))}
    </div>
  );
};
