import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface TokensPageProps {
  user?: AuthedUser;
}

export const TokensPage: FC<TokensPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          API トークン管理
        </h1>
        <p class="text-sm opacity-60 mt-1">
          外部 CI/CD ツールや API クライアントから Ouroboros 連携を行うためのスコープ付き API トークンを生成・管理します。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: トークンの新規作成 (1.2カラム分) */}
        <div class="xl:col-span-1 space-y-6">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="key-round" class="w-5 h-5 text-primary" />
                <span>トークンの新規作成</span>
              </h2>
              
              <form
                hx-post="/ui/fragments/tokens"
                hx-target="#token-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                hx-on--after-request="if(event.detail.successful) this.reset()"
                class="space-y-4"
              >
                <div class="form-control">
                  <label class="label py-1" for="name">
                    <span class="label-text font-semibold opacity-75">トークン識別名</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    placeholder="例: github-actions-ci"
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    required
                  />
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="scopes">
                    <span class="label-text font-semibold opacity-75">付与する権限スコープ</span>
                  </label>
                  <select 
                    name="scopes" 
                    id="scopes" 
                    class="select select-bordered w-full input-glow rounded-xl mt-1 text-sm min-h-24" 
                    multiple
                    required
                  >
                    <option value="read" selected>read (情報の読み取りのみ)</option>
                    <option value="inspect">inspect (コード解析の実行)</option>
                    <option value="heal">heal (自動自己修復の起動)</option>
                  </select>
                  <label class="label px-1">
                    <span class="label-text-alt opacity-50">複数選択する場合は Ctrl (Cmd) キーを押しながらクリックします。</span>
                  </label>
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="expiresInDays">
                    <span class="label-text font-semibold opacity-75">有効期限 (日数)</span>
                  </label>
                  <input
                    type="number"
                    name="expiresInDays"
                    id="expiresInDays"
                    placeholder="30"
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    min={1}
                    max={365}
                  />
                  <label class="label px-1">
                    <span class="label-text-alt opacity-50">未指定の場合は期限なしになります（最大365日）。</span>
                  </label>
                </div>
                
                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="plus" class="w-4 h-4" />
                    <span>トークンを生成</span>
                  </button>
                </div>
              </form>
              
              {/* 生成トークンの結果表示（クリップボードコピーUIなど） */}
              <div id="token-result" class="mt-4 empty:hidden transition-all duration-300"></div>
            </div>
          </div>
        </div>

        {/* 右側: 有効なトークン一覧 (1.8カラム分) */}
        <div class="xl:col-span-2">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="list" class="w-5 h-5 text-secondary" />
                <span>有効なトークン一覧</span>
              </h2>
              
              <div
                hx-get="/ui/fragments/tokens"
                hx-trigger="load"
                hx-target="this"
                hx-swap="innerHTML"
              >
                {/* 読み込み中のプレースホルダー */}
                <div class="space-y-3">
                  <div class="skeleton h-12 w-full rounded-xl"></div>
                  <div class="skeleton h-12 w-full rounded-xl"></div>
                  <div class="skeleton h-12 w-full rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { TokensPageProps };
