import type { FC } from "hono/jsx";
import type { CodeSessionRow } from "../../db/repositories";

interface CodeSessionListProps {
  sessions: CodeSessionRow[];
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  ready: { label: "準備完了", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  planning: { label: "プラン生成中", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  generating: { label: "生成中", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  generated: { label: "パッチ生成済", class: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  applied: { label: "適用済", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed: { label: "失敗", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  dismissed: { label: "破棄", class: "bg-base-content/5 text-base-content/50 border border-[var(--glass-border)]" },
};

/** Code モードのセッション一覧テーブル。 */
export const CodeSessionList: FC<CodeSessionListProps> = ({ sessions }) => {
  if (sessions.length === 0) {
    return (
      <div class="card card-glass p-8 text-center text-base-content/50">
        <i data-lucide="code" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
        <p class="font-bold">セッションはありません</p>
        <p class="text-xs opacity-75 mt-1">「セッションを開始」から新しいコード編集セッションを作成できます。</p>
      </div>
    );
  }

  return (
    <div class="card card-glass shadow-lg overflow-x-auto">
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">タイトル</th>
            <th class="p-3">リポジトリ</th>
            <th class="p-3">ブランチ</th>
            <th class="p-3">ステータス</th>
            <th class="p-3">作成日</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const status = STATUS_CONFIG[s.status] ?? { label: s.status, class: "badge-ghost" };
            return (
              <tr key={s.id} class="border-b border-[var(--glass-border)]/30 hover:bg-base-200/40 transition-colors">
                <td class="p-3 font-medium text-base-content max-w-xs truncate">
                  <a href={`/code/sessions/${s.id}`} class="link link-hover link-primary">
                    {s.title}
                  </a>
                </td>
                <td class="p-3 font-mono text-xs opacity-70 max-w-xs truncate">{s.repo_url}</td>
                <td class="p-3">
                  <span class="font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
                    {s.branch}
                  </span>
                </td>
                <td class="p-3">
                  <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
                </td>
                <td class="p-3 text-xs opacity-70">
                  {new Date(s.created_at).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
