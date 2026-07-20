import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface WebhooksPageProps {
  user?: AuthedUser;
}

export const WebhooksPage: FC<WebhooksPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          Webhook 連携設定
        </h1>
        <p class="text-sm opacity-60 mt-1">
          自動修復やコードスキャンの開始・終了・重要検出事項といったシステムイベントを、外部チャット（Slack, Discord等）や外部システムへリアルタイム通知します。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: Webhookの新規作成 (1.2カラム分) */}
        <div class="xl:col-span-1 space-y-6">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="webhook" class="w-5 h-5 text-primary" />
                <span>Webhookの新規登録</span>
              </h2>
              
              <form
                hx-post="/ui/fragments/webhooks"
                hx-target="#webhook-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                hx-on--after-request="if(event.detail.successful) this.reset()"
                class="space-y-4"
              >
                <div class="form-control">
                  <label class="label py-1" for="name">
                    <span class="label-text font-semibold opacity-75">名称</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    placeholder="例: Slack通知チャネル"
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    required
                  />
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="url">
                    <span class="label-text font-semibold opacity-75">宛先 URL</span>
                  </label>
                  <input
                    type="url"
                    name="url"
                    id="url"
                    placeholder="https://hooks.slack.com/services/..."
                    class="input input-bordered w-full font-mono input-glow rounded-xl mt-1 text-xs"
                    required
                  />
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="adapter">
                    <span class="label-text font-semibold opacity-75">アダプター形式</span>
                  </label>
                  <select 
                    name="adapter" 
                    id="adapter" 
                    class="select select-bordered w-full input-glow rounded-xl mt-1 text-sm font-medium"
                    required
                  >
                    <option value="generic">Generic (汎用 JSON 形式)</option>
                    <option value="slack">Slack</option>
                    <option value="discord">Discord</option>
                    <option value="github">GitHub</option>
                  </select>
                </div>
                
                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="plus" class="w-4 h-4" />
                    <span>Webhookを登録</span>
                  </button>
                </div>
              </form>

              {/* 登録結果の表示エリア */}
              <div id="webhook-result" class="mt-4 empty:hidden transition-all duration-300"></div>
            </div>
          </div>
        </div>

        {/* 右側: Webhook一覧 (1.8カラム分) */}
        <div class="xl:col-span-2">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="list" class="w-5 h-5 text-secondary" />
                <span>登録済み Webhook 一覧</span>
              </h2>
              
              <div
                hx-get="/ui/fragments/webhooks"
                hx-trigger="load"
                hx-target="this"
                hx-swap="innerHTML"
              >
                {/* 読み込み中のプレースホルダー */}
                <div class="space-y-3">
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
export { WebhooksPageProps };
