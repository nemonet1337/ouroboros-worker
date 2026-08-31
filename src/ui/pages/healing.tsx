import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";
import { HealingFixModalShell } from "../components/healing-fix-modal";

interface HealingPageProps {
  user?: AuthedUser;
  selectedRepo?: { owner: string; repo: string } | null;
}

export const HealingPage: FC<HealingPageProps> = ({ user, selectedRepo = null }) => {
  const repoLabel =
    selectedRepo?.owner && selectedRepo?.repo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "";
  return (
    <Layout user={user}>
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">コード解析</h1>
        <p class="text-sm opacity-60 mt-1">
          コードインデックス構築 → AI 解析 → 確認後に自動修復。結果は履歴からレーダーチャート付きで確認できます。
        </p>
      </div>

      <div class="card card-glass shadow-lg mb-8">
        <div class="card-body p-6 md:p-8">
          <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
            <i data-lucide="scan-search" class="w-5 h-5 text-primary" />
            <span>リポジトリ解析</span>
          </h2>

          {!repoLabel ? (
            <div class="alert alert-warning rounded-xl flex items-center gap-2 text-sm">
              <i data-lucide="alert-triangle" class="w-5 h-5" />
              <span>
                対象リポジトリが選択されていません。
                <a href="/" class="link font-bold">
                  ダッシュボード
                </a>
                でリポジトリを選択してください。
              </span>
            </div>
          ) : (
            <form
              hx-post="/ui/fragments/healing"
              hx-target="#healing-result"
              hx-swap="innerHTML"
              hx-disabled-elt="button[type='submit']"
              class="space-y-6"
            >
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text font-semibold opacity-75">対象リポジトリ</span>
                </label>
                <div class="input w-full rounded-xl mt-1 text-sm font-mono flex items-center gap-2 bg-base-200/60">
                  <i data-lucide="github" class="w-4 h-4 opacity-60" />
                  <span>{repoLabel}</span>
                </div>
              </div>

              <div class="form-control">
                <label class="label py-1" for="instruction">
                  <span class="label-text font-semibold opacity-75">解析の指示（任意）</span>
                </label>
                <textarea
                  name="instruction"
                  id="instruction"
                  class="textarea w-full input-glow rounded-xl mt-1 text-sm leading-relaxed bg-black/10 placeholder-base-content/30"
                  rows={4}
                  placeholder="例: 認証まわりのセキュリティ問題を重点的に解析してください。（空欄の場合は全体的な品質を解析します）"
                ></textarea>
              </div>

              <div class="form-control pt-2">
                <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                  <i data-lucide="play" class="w-4 h-4" />
                  <span>解析を実行する</span>
                </button>
              </div>
            </form>
          )}

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
