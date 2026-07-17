import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface InspectionPageProps {
  user?: AuthedUser;
  selectedRepo?: { owner: string; repo: string } | null;
}

export const InspectionPage: FC<InspectionPageProps> = ({ user, selectedRepo = null }) => {
  const repoLabel = selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "";
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          AI コード解析 (Inspection)
        </h1>
        <p class="text-sm opacity-60 mt-1">
          選択中のリポジトリを対象に、コードインデックス構築 → Vectorize 検索 → AI 解析の
          パイプラインを実行します。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: 解析フォーム (2カラム幅) */}
        <div class="xl:col-span-2 space-y-6">
          <div class="card card-glass shadow-lg">
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
                    <a href="/" class="link font-bold">ダッシュボード</a>
                    でリポジトリを選択してください。
                  </span>
                </div>
              ) : (
                <form
                  hx-post="/ui/fragments/inspect"
                  hx-target="#inspect-result"
                  hx-swap="innerHTML"
                  hx-disabled-elt="button[type='submit']"
                  class="space-y-6"
                >
                  <div class="form-control">
                    <label class="label py-1">
                      <span class="label-text font-semibold opacity-75">対象リポジトリ</span>
                    </label>
                    <div class="input input-bordered w-full rounded-xl mt-1 text-sm font-mono flex items-center gap-2 bg-base-200/60">
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
                      class="textarea textarea-bordered w-full input-glow rounded-xl mt-1 text-sm leading-relaxed bg-black/10 placeholder-base-content/30"
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
            </div>
          </div>

          {/* 解析結果 / 進捗表示エリア */}
          <div id="inspect-result" class="empty:hidden transition-all duration-300"></div>
        </div>

        {/* 右側: 過去の履歴 (1カラム幅) */}
        <div class="xl:col-span-1">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="history" class="w-5 h-5 text-secondary" />
                <span>スキャン履歴</span>
              </h2>

              <div
                hx-get="/ui/fragments/history"
                hx-trigger="load"
                hx-target="this"
                hx-swap="innerHTML"
              >
                {/* 履歴読み込み中のプレースホルダー */}
                <div class="space-y-4">
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { InspectionPageProps };
