import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface CodeNewPageProps {
  user?: AuthedUser;
}

export const CodeNewPage: FC<CodeNewPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          新規セッションの作成
        </h1>
        <p class="text-sm opacity-60 mt-1">
          編集対象の Git リポジトリと、AI に対する編集タスクの内容を入力して編集セッションを開始します。
        </p>
      </div>

      <div class="card card-glass shadow-lg max-w-2xl">
        <div class="card-body p-6 md:p-8">
          <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
            <i data-lucide="plus-circle" class="w-5 h-5 text-primary" />
            <span>セッション設定フォーム</span>
          </h2>
          
          <form
            hx-post="/ui/fragments/code/sessions"
            hx-target="#code-new-result"
            hx-swap="innerHTML"
            hx-disabled-elt="button[type='submit']"
            class="space-y-6"
          >
            <div class="form-control">
              <label class="label py-1" for="repoUrl">
                <span class="label-text font-semibold opacity-75">リポジトリ URL</span>
              </label>
              <input 
                type="url" 
                name="repoUrl" 
                id="repoUrl" 
                placeholder="https://github.com/owner/repo" 
                class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm font-mono" 
                required 
              />
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
            
            {/* 送信ボタンの hidden 属性を削除し、表示・スタイリングを修正 */}
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

          {/* エラー時の表示エリア（成功時は HX-Redirect でセッション画面へ遷移する） */}
          <div id="code-new-result" class="mt-4 empty:hidden transition-all duration-300"></div>
        </div>
      </div>
    </Layout>
  );
};
export { CodeNewPageProps };
