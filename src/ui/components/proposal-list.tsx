import type { FC } from "hono/jsx";

interface ProposalListItem {
  id: string;
  status: string;
  created_at: number;
}

interface ProposalListProps {
  proposals: ProposalListItem[];
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  proposed: { label: "提案中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  applied: { label: "適用済", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  dismissed: { label: "却下", class: "bg-base-content/5 text-base-content/50 border border-[var(--glass-border)]" },
};

/** Refactor モードの提案一覧。 */
export const ProposalList: FC<ProposalListProps> = ({ proposals }) => {
  if (proposals.length === 0) {
    return (
      <div class="card card-glass p-8 text-center text-base-content/50">
        <i data-lucide="git-pull-request" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
        <p class="font-bold">リファクタリング提案はまだありません</p>
        <p class="text-xs opacity-75 mt-1">
          コード解析（Inspection）の結果から提案が生成されると、ここに表示されます。
        </p>
      </div>
    );
  }

  return (
    <div class="card card-glass shadow-lg overflow-x-auto">
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">提案 ID</th>
            <th class="p-3">ステータス</th>
            <th class="p-3">作成日</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => {
            const status = STATUS_CONFIG[p.status] ?? { label: p.status, class: "badge-ghost" };
            return (
              <tr key={p.id} class="border-b border-[var(--glass-border)]/30 hover:bg-base-200/40 transition-colors">
                <td class="p-3 font-mono text-xs text-primary">{p.id.slice(0, 8)}</td>
                <td class="p-3">
                  <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
                </td>
                <td class="p-3 text-xs opacity-70">
                  {new Date(p.created_at).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </td>
                <td class="p-3 text-right">
                  <a href={`/refactor/proposals/${p.id}`} class="btn btn-sm btn-outline rounded-lg gap-1">
                    <i data-lucide="eye" class="w-3.5 h-3.5" />
                    <span>詳細</span>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
