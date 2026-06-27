import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface SettingsPageProps {
  user?: AuthedUser;
}

export const SettingsPage: FC<SettingsPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          システム設定
        </h1>
        <p class="text-sm opacity-60 mt-1">
          個人プロファイルの更新、利用する AI モデルの構成、および高度なシステムの動作制御
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: プロファイル & AIモデル (2カラム分) */}
        <div class="xl:col-span-2 space-y-6">
          
          {/* プロファイル設定カード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="user" class="w-5 h-5 text-primary" />
                <span>プロファイル設定</span>
              </h2>
              
              <form
                hx-put="/api/v1/auth/me"
                hx-target="#profile-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                class="space-y-4"
              >
                <div class="form-control">
                  <label class="label py-1" for="email">
                    <span class="label-text font-semibold opacity-75">メールアドレス</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    placeholder={user?.email || "you@example.com"}
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    required
                  />
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="password">
                    <span class="label-text font-semibold opacity-75">新しいパスワード</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    id="password"
                    placeholder="変更しない場合は空欄のままにしてください"
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    minlength={8}
                  />
                  <label class="label px-1">
                    <span class="label-text-alt opacity-50">変更する場合のみ、8文字以上で入力します。</span>
                  </label>
                </div>
                
                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="save" class="w-4 h-4" />
                    <span>プロフィールを保存</span>
                  </button>
                </div>
              </form>
              <div id="profile-result" class="mt-4 empty:hidden"></div>
            </div>
          </div>

          {/* AIモデル設定カード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="cpu" class="w-5 h-5 text-secondary" />
                <span>AI 推論モデル設定</span>
              </h2>
              <p class="text-xs opacity-60 mb-6">
                自己修復やスキャン時に利用される Cloudflare Workers AI モデルを指定します。
              </p>
              
              <div
                hx-get="/api/v1/models"
                hx-trigger="load"
                hx-target="#models-list"
                hx-swap="innerHTML"
              >
                <div id="models-list">
                  <div class="skeleton h-32 w-full rounded-xl"></div>
                </div>
              </div>
              
              <div
                hx-get="/api/v1/settings/model"
                hx-trigger="load"
                hx-target="#model-settings"
                hx-swap="innerHTML"
              >
                <div id="model-settings">
                  <div class="skeleton h-12 w-full mt-4 rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 右側: 高度なシステム設定 (1カラム分) */}
        <div class="xl:col-span-1">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="sliders" class="w-5 h-5 text-accent" />
                <span>高度なシステム構成</span>
              </h2>
              <p class="text-xs opacity-60 mb-6">
                スコア重み付けや閾値、自動修復スケジュール等の詳細な振る舞いを制御します。
              </p>
              
              <div
                hx-get="/api/v1/settings"
                hx-trigger="load"
                hx-target="this"
                hx-swap="innerHTML"
              >
                <div class="skeleton h-80 w-full rounded-xl"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { SettingsPageProps };
