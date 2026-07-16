import type { FC } from "hono/jsx";

interface PullRequest {
  number: number;
  title: string;
  branch: string;
  status: "open" | "merged" | "closed";
  created_at: string;
}

interface PRHistoryProps {
  items: PullRequest[];
  page?: number;
  perPage?: number;
}

export const PRHistory: FC<PRHistoryProps> = ({ items, page = 1, perPage = 10 }) => {
  const getStatusBadge = (status: PullRequest["status"]) => {
    switch (status) {
      case "merged":
        return (
          <span class="badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 badge-pulse">
            マージ済
          </span>
        );
      case "open":
        return (
          <span class="badge badge-sm rounded-full font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            オープン
          </span>
        );
      case "closed":
        return (
          <span class="badge badge-sm rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            クローズ
          </span>
        );
      default:
        return <span class="badge badge-sm rounded-full font-bold badge-ghost">不明</span>;
    }
  };

  return (
    <div id="pr-history-container" class="overflow-x-auto w-full">
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">#</th>
            <th class="p-3">タイトル</th>
            <th class="p-3">ブランチ</th>
            <th class="p-3">ステータス</th>
            <th class="p-3">作成日</th>
          </tr>
        </thead>
        <tbody>
          {items.map((pr) => (
            <tr key={pr.number} class="border-b border-[var(--glass-border)]/30">
              <td class="p-3 font-mono font-bold text-primary">#{pr.number}</td>
              <td class="p-3 font-medium text-base-content max-w-xs sm:max-w-md truncate">
                {pr.title}
              </td>
              <td class="p-3">
                <span class="font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
                  {pr.branch}
                </span>
              </td>
              <td class="p-3">{getStatusBadge(pr.status)}</td>
              <td class="p-3 text-xs opacity-70">
                {new Date(pr.created_at).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div class="card card-glass p-8 text-center text-base-content/50 my-2">
          <i data-lucide="git-pull-request" class="w-12 h-12 mx-auto text-base-content/30 mb-3 animate-pulse" />
          <p class="font-bold">プルリクエスト履歴はありません</p>
          <p class="text-xs opacity-75 mt-1">自己修復によるPR作成がまだ実行されていません。</p>
        </div>
      )}

      {items.length > 0 && (
        <div class="flex items-center justify-between mt-6 px-1">
          <span class="text-xs opacity-60">ページ {page}</span>
          <div class="flex gap-2">
            <button
              class="btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200"
              disabled={page <= 1}
              hx-get={`/ui/fragments/prs?page=${page - 1}`}
              hx-target="#pr-history-container"
              hx-swap="outerHTML"
            >
              <i data-lucide="chevron-left" class="w-4 h-4" />
              <span>前へ</span>
            </button>
            <button
              class="btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200"
              disabled={items.length < perPage}
              hx-get={`/ui/fragments/prs?page=${page + 1}`}
              hx-target="#pr-history-container"
              hx-swap="outerHTML"
            >
              <span>次へ</span>
              <i data-lucide="chevron-right" class="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export { PullRequest, PRHistoryProps };
