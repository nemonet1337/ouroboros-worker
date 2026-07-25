import type { FC } from "hono/jsx";

export interface NotificationItem {
  /** lucide アイコン名 */
  icon: string;
  /** 種別ラベル（例: コード解析） */
  kind: string;
  /** 表示タイトル（対象や ID） */
  title: string;
  /** 現在のステータス表示 */
  status: string;
  /** クリック時の遷移先 */
  href: string;
  /** 開始時刻（epoch ms） */
  at: number;
}

interface NotificationBellProps {
  items: NotificationItem[];
}

/**
 * ナビバー常駐の進捗通知ベル。進行中のコード解析・自己修復・コード編集
 * セッションを一覧表示する。どのページにいても実行中アクションが見える。
 * Layout 側のラッパー div が 10 秒間隔でこのフラグメントをポーリングする。
 */
export const NotificationBell: FC<NotificationBellProps> = ({ items }) => {
  return (
    <div class="dropdown dropdown-end">
      <button class="btn btn-ghost btn-sm btn-circle indicator" aria-label="進行中のアクション">
        <i data-lucide="bell" class="w-5 h-5" />
        {items.length > 0 && (
          <span class="indicator-item badge badge-primary badge-xs font-bold">{items.length}</span>
        )}
      </button>
      <div class="dropdown-content z-50 bg-base-100 rounded-xl w-80 p-2 mt-2 shadow-2xl border border-[var(--glass-border)]">
        <div class="px-3 py-2 text-xs font-semibold opacity-60 border-b border-[var(--glass-border)]">
          進行中のアクション
        </div>
        {items.length === 0 ? (
          <div class="px-3 py-4 text-xs opacity-50 text-center">実行中のアクションはありません</div>
        ) : (
          <ul class="menu menu-sm p-0">
            {items.map((item) => (
              <li>
                <a href={item.href} class="flex items-start gap-2 py-2">
                  <i data-lucide={item.icon} class="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <span class="flex-1 min-w-0">
                    <span class="block text-xs font-semibold truncate">
                      {item.kind}: {item.title}
                    </span>
                    <span class="block text-xs opacity-60">
                      <span class="loading loading-dots loading-xs align-middle mr-1"></span>
                      {item.status} ・{" "}
                      {new Date(item.at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
