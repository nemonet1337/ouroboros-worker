import type { FC } from "hono/jsx";
import type { ApiTokenRow } from "../../db/repositories";

interface TokenListProps {
  tokens: Array<Omit<ApiTokenRow, "token_hash">>;
  /** true にすると hx-swap-oob 付きで出力され、別レスポンスに同梱してリストを差し替えられる */
  oob?: boolean;
}

const SCOPE_CLASSES: Record<string, string> = {
  read: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  inspect: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  heal: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  admin: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
};

const formatDate = (ts: number | null): string =>
  ts
    ? new Date(ts).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "—";

/** 有効な API トークン一覧。失効操作は /ui/fragments/tokens/:id/revoke で更新後リストに置換。 */
export const TokenList: FC<TokenListProps> = ({ tokens, oob }) => {
  const active = tokens.filter((t) => !t.revoked_at);

  if (active.length === 0) {
    return (
      <div id="token-list" hx-swap-oob={oob ? "true" : undefined}>
        <div class="card card-glass p-8 text-center text-base-content/50">
          <i data-lucide="key-round" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">有効なトークンはありません</p>
          <p class="text-xs opacity-75 mt-1">左のフォームから新しい API トークンを生成できます。</p>
        </div>
      </div>
    );
  }

  return (
    <div id="token-list" class="overflow-x-auto" hx-swap-oob={oob ? "true" : undefined}>
      <table class="table-modern w-full text-left text-sm">
        <thead>
          <tr class="text-base-content/60 font-semibold border-b border-[var(--glass-border)]">
            <th class="p-3">名称</th>
            <th class="p-3">プレフィックス</th>
            <th class="p-3">スコープ</th>
            <th class="p-3">有効期限</th>
            <th class="p-3">最終使用</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {active.map((t) => (
            <tr key={t.id} class="border-b border-[var(--glass-border)]/30">
              <td class="p-3 font-medium text-base-content max-w-xs truncate">{t.name}</td>
              <td class="p-3">
                <span class="font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
                  {t.prefix}…
                </span>
              </td>
              <td class="p-3">
                <div class="flex gap-1 flex-wrap">
                  {t.scopes.split(",").filter(Boolean).map((s) => (
                    <span
                      key={s}
                      class={`badge badge-sm rounded-full font-bold ${SCOPE_CLASSES[s] ?? "badge-ghost"}`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </td>
              <td class="p-3 text-xs opacity-70">{t.expires_at ? formatDate(t.expires_at) : "無期限"}</td>
              <td class="p-3 text-xs opacity-70">{formatDate(t.last_used_at)}</td>
              <td class="p-3 text-right">
                <button
                  class="btn btn-sm btn-outline btn-error rounded-lg gap-1"
                  hx-post={`/ui/fragments/tokens/${t.id}/revoke`}
                  hx-target="#token-list"
                  hx-swap="outerHTML"
                  hx-confirm={`トークン「${t.name}」を失効させますか？この操作は取り消せません。`}
                >
                  <i data-lucide="ban" class="w-3.5 h-3.5" />
                  <span>失効</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
