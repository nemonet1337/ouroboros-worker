import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface AdminPageProps {
  user?: AuthedUser;
}

export const AdminPage: FC<AdminPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-base-content flex items-center gap-2">
            <i data-lucide="shield-check" class="w-8 h-8 text-primary" />
            <span>管理者コントロールパネル</span>
          </h1>
          <p class="text-sm opacity-60 mt-1">
            システム稼働ログの監視、アプリケーション環境設定の確認、および新規登録の開放制御
          </p>
        </div>
        <div class="badge badge-primary font-bold px-3 py-3 rounded-lg flex gap-1">
          <i data-lucide="award" class="w-4 h-4" />
          <span>システム管理者権限</span>
        </div>
      </div>

      <div class="space-y-6">
        {/* 新規登録トグルカード（上部に配置してアクセスしやすく） */}
        <div class="card card-glass shadow-lg">
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
              <i data-lucide="user-plus" class="w-5 h-5 text-accent" />
              <span>一般ユーザーの新規登録制御</span>
            </h2>
            
            <div
              hx-get="/ui/fragments/admin/registration"
              hx-trigger="load"
              hx-target="this"
              hx-swap="innerHTML"
            >
              {/* 読み込み中のプレースホルダー */}
              <div class="skeleton h-12 w-full rounded-xl"></div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* システムログカード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
                <i data-lucide="file-text" class="w-5 h-5 text-primary" />
                <span>システムログ (R2 バケット)</span>
              </h2>
              
              <div
                hx-get="/ui/fragments/admin/logs"
                hx-trigger="load"
                hx-target="#logs-list"
                hx-swap="innerHTML"
              >
                <div id="logs-list">
                  <div class="skeleton h-48 w-full rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>

          {/* システム構成・環境変数カード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
                <i data-lucide="settings" class="w-5 h-5 text-secondary" />
                <span>システム環境設定 (読み取り専用)</span>
              </h2>
              
              <div
                hx-get="/ui/fragments/admin/config"
                hx-trigger="load"
                hx-target="#config-view"
                hx-swap="innerHTML"
              >
                <div id="config-view">
                  <div class="skeleton h-48 w-full rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { AdminPageProps };
