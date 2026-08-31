import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";
import { HealingFixModalShell } from "../components/healing-fix-modal";

interface HealingPageProps {
  user?: AuthedUser;
}

export const HealingPage: FC<HealingPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          自己修復システム (Self Healing)
        </h1>
        <p class="text-sm opacity-60 mt-1">
          コードインデックス構築 → 解析 → 確認後に自動修復。結果は履歴から詳しく確認できます。
        </p>
      </div>

      <div class="card card-glass shadow-lg mb-8">
        <div class="card-body p-6">
          <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
            <i data-lucide="scan-search" class="w-5 h-5 text-primary" />
            <span>リポジトリ解析</span>
          </h2>
          <p class="text-sm opacity-70 mb-4">
            Vectorize でコードをインデックスし、6 次元スコアと検出事項を生成します。修復は解析完了後に個別に開始します。
          </p>
          <button
            class="btn btn-gradient rounded-xl px-5 gap-2 flex items-center justify-center"
            hx-post="/ui/fragments/healing"
            hx-target="#healing-result"
            hx-swap="innerHTML"
            hx-disabled-elt="this"
          >
            <i data-lucide="play" class="w-4 h-4" />
            <span>解析を実行する</span>
          </button>
          <div id="healing-result" class="mt-4 empty:hidden transition-all duration-300"></div>
        </div>
      </div>

      <div class="space-y-4">
        <h2 class="text-xl font-bold flex items-center gap-2 px-1">
          <i data-lucide="history" class="w-5 h-5 text-secondary" />
          <span>解析・修復履歴</span>
        </h2>
        <p class="text-xs opacity-50 px-1 -mt-2">
          カードをクリックするとレーダーチャート付きの詳細を表示します。解析完了後に修復を開始できます。
        </p>
        <div hx-get="/ui/fragments/healing/runs" hx-trigger="load" hx-swap="outerHTML">
          <div class="card card-glass p-6 space-y-4">
            <div class="skeleton h-8 w-1/4 rounded-lg"></div>
            <div class="space-y-2">
              <div class="skeleton h-20 w-full rounded-lg"></div>
              <div class="skeleton h-20 w-full rounded-lg"></div>
              <div class="skeleton h-20 w-full rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>

      <HealingFixModalShell />
    </Layout>
  );
};
export { HealingPageProps };
