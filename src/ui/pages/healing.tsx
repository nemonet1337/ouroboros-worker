import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface HealingPageProps {
  user?: AuthedUser;
}

export const HealingPage: FC<HealingPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          自己修復システム (Self Healing)
        </h1>
        <p class="text-sm opacity-60 mt-1">
          AI自己修復サイクルの手動起動と、過去の修復実行履歴の確認
        </p>
      </div>

      {/* 手動起動パネル */}
      <div class="card card-glass shadow-lg mb-8">
        <div class="card-body p-6">
          <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
            <i data-lucide="play-circle" class="w-5 h-5 text-primary" />
            <span>手動トリガー</span>
          </h2>
          
          <div class="flex flex-wrap gap-3">
            <button
              class="btn btn-gradient rounded-xl px-5 gap-2 flex items-center justify-center"
              hx-post="/ui/fragments/healing"
              hx-vals='{"dryRun":"false"}'
              hx-target="#healing-result"
              hx-swap="innerHTML"
              hx-disabled-elt="this"
            >
              <i data-lucide="shield-alert" class="w-4 h-4" />
              <span>フル修復を実行する</span>
            </button>
            
            <button
              class="btn btn-outline rounded-xl border-[var(--glass-border)] hover:bg-base-200 px-5 gap-2 flex items-center justify-center text-base-content/85"
              hx-post="/ui/fragments/healing"
              hx-vals='{"dryRun":"true"}'
              hx-target="#healing-result"
              hx-swap="innerHTML"
              hx-disabled-elt="this"
            >
              <i data-lucide="eye" class="w-4 h-4" />
              <span>ドライラン (検証のみ)</span>
            </button>
          </div>
          
          {/* 結果表示エリア */}
          <div id="healing-result" class="mt-4 empty:hidden transition-all duration-300"></div>
        </div>
      </div>

      {/* 履歴セクション */}
      <div class="space-y-4">
        <h2 class="text-xl font-bold flex items-center gap-2 px-1">
          <i data-lucide="history" class="w-5 h-5 text-secondary" />
          <span>修復実行履歴</span>
        </h2>

        {/* 履歴一覧のHTMX動的読み込み */}
        <div hx-get="/ui/fragments/healing/runs" hx-trigger="load" hx-target="#healing-runs" hx-swap="innerHTML">
          <div id="healing-runs">
            {/* ローディング時スケルトン */}
            <div class="card card-glass p-6 space-y-4">
              <div class="skeleton h-8 w-1/4 rounded-lg"></div>
              <div class="space-y-2">
                <div class="skeleton h-12 w-full rounded-lg"></div>
                <div class="skeleton h-12 w-full rounded-lg"></div>
                <div class="skeleton h-12 w-full rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { HealingPageProps };
