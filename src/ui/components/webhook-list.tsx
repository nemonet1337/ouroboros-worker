import type { FC } from "hono/jsx";
import type { WebhookView } from "../../http/data";

interface WebhookListProps {
  webhooks: WebhookView[];
  /** true にすると hx-swap-oob 付きで出力され、別レスポンスに同梱してリストを差し替えられる */
  oob?: boolean;
}

const ADAPTER_LABELS: Record<string, string> = {
  generic: "Generic",
  slack: "Slack",
  discord: "Discord",
  github: "GitHub",
};

/**
 * 登録済み Webhook 一覧。ミューテーション（有効切替・削除・テスト送信）は
 * /ui/fragments/webhooks/... を叩き、更新後のリスト HTML でこの要素ごと置き換える。
 */
export const WebhookList: FC<WebhookListProps> = ({ webhooks, oob }) => {
  return (
    <div id="webhook-list" class="space-y-3" hx-swap-oob={oob ? "true" : undefined}>
      <div id="webhook-test-result" class="empty:hidden"></div>

      {webhooks.length === 0 && (
        <div class="card card-glass p-8 text-center text-base-content/50">
          <i data-lucide="webhook" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">登録済みの Webhook はありません</p>
          <p class="text-xs opacity-75 mt-1">左のフォームから通知先を登録できます。</p>
        </div>
      )}

      {webhooks.map((w) => (
        <div
          key={w.id}
          class="card card-glass p-4 flex flex-col sm:flex-row sm:items-center gap-3 border border-[var(--glass-border)]"
        >
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-sm truncate">{w.name}</span>
              <span class="badge badge-sm rounded-full font-bold bg-primary/10 text-primary border border-primary/20">
                {ADAPTER_LABELS[w.adapter] ?? w.adapter}
              </span>
              {w.enabled ? (
                <span class="badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  有効
                </span>
              ) : (
                <span class="badge badge-sm rounded-full font-bold bg-base-content/5 text-base-content/50 border border-[var(--glass-border)]">
                  無効
                </span>
              )}
            </div>
            <div class="font-mono text-xs opacity-60 truncate">{w.url}</div>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <button
              class="btn btn-sm btn-outline rounded-lg gap-1"
              hx-post={`/ui/fragments/webhooks/${w.id}/toggle`}
              hx-target="#webhook-list"
              hx-swap="outerHTML"
            >
              <i data-lucide={w.enabled ? "pause" : "play"} class="w-3.5 h-3.5" />
              <span>{w.enabled ? "無効化" : "有効化"}</span>
            </button>
            <button
              class="btn btn-sm btn-outline rounded-lg gap-1"
              hx-post={`/ui/fragments/webhooks/${w.id}/test`}
              hx-target="#webhook-test-result"
              hx-swap="innerHTML"
              hx-disabled-elt="this"
            >
              <i data-lucide="send" class="w-3.5 h-3.5" />
              <span>テスト送信</span>
            </button>
            <button
              class="btn btn-sm btn-outline btn-error rounded-lg gap-1"
              hx-post={`/ui/fragments/webhooks/${w.id}/delete`}
              hx-target="#webhook-list"
              hx-swap="outerHTML"
              hx-confirm={`Webhook「${w.name}」を削除しますか？`}
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5" />
              <span>削除</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
