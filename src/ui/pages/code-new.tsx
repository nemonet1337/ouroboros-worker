import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface CodeNewPageProps {
  user?: AuthedUser;
  selectedRepo?: { owner: string; repo: string } | null;
}

export const CodeNewPage: FC<CodeNewPageProps> = ({ user, selectedRepo = null }) => {
  const repoLabel = selectedRepo ? `${selectedRepo.owner}/${selectedRepo.repo}` : "";
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          新規セッションの作成
        </h1>
        <p class="text-sm opacity-60 mt-1">
          選択中のリポジトリに対して、AI に編集タスクを指示して編集セッションを開始します。
        </p>
      </div>

      <div class="card card-glass shadow-lg max-w-2xl">
        <div class="card-body p-6 md:p-8">
          <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
            <i data-lucide="plus-circle" class="w-5 h-5 text-primary" />
            <span>セッション設定フォーム</span>
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
              hx-post="/ui/fragments/code/sessions"
              hx-target="#code-new-result"
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
                <label class="label px-1">
                  <span class="label-text-alt opacity-50">
                    ダッシュボードで選択したリポジトリが使われます。
                  </span>
                </label>
              </div>

              <div class="form-control">
                <label class="label py-1" for="title">
                  <span class="label-text font-semibold opacity-75">セッション名 / 目的</span>
                </label>
                <input
                  type="text"
                  name="title"
                  id="title"
                  placeholder="例: ログインフォームのレイアウトバグ修正"
                  class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                  required
                />
              </div>

              <div class="form-control">
                <label class="label py-1" for="instruction">
                  <span class="label-text font-semibold opacity-75">AI への編集指示</span>
                </label>
                <textarea
                  name="instruction"
                  id="instruction"
                  class="textarea textarea-bordered w-full input-glow rounded-xl mt-1 text-sm leading-relaxed bg-black/10 placeholder-base-content/30"
                  rows={6}
                  placeholder="例: src/ui/pages/login.tsx 内のレイアウトスタイルについて、入力フォーム周辺のパディングを増やし、グラデーションボタンをより鮮やかに変更してください。"
                  required
                ></textarea>
              </div>

              <div class="form-control pt-2">
                <button
                  type="submit"
                  class="btn btn-gradient w-full rounded-xl py-3 h-auto gap-2 flex items-center justify-center"
                >
                  <i data-lucide="play" class="w-4 h-4" />
                  <span>セッションを立ち上げる</span>
                </button>
              </div>
            </form>
          )}

          {/* エラー時の表示エリア（成功時は HX-Redirect でセッション画面へ遷移する） */}
          <div id="code-new-result" class="mt-4 empty:hidden transition-all duration-300"></div>
        </div>
      </div>
    </Layout>
  );
};
export { CodeNewPageProps };
