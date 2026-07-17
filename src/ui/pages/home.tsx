import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface HomePageProps {
  user?: AuthedUser;
}

export const HomePage: FC<HomePageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ウェルカムセクション */}
      <div class="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
            ダッシュボード
          </h1>
          <p class="text-sm opacity-60 mt-1">
            システムの状態と AI 自己修復履歴の概要
          </p>
        </div>
        <div class="text-xs opacity-50 bg-base-200 px-3 py-1.5 rounded-lg border border-[var(--glass-border)] self-start md:self-auto">
          最終更新: <span id="current-time">{new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
        </div>
      </div>

      {/* リポジトリ選択カード（システム全体で 1 つの対象リポジトリ） */}
      <div class="mb-8">
        <div
          class="card card-glass shadow-lg"
          hx-get="/ui/fragments/repos"
          hx-trigger="load"
          hx-target="this"
          hx-swap="innerHTML"
        >
          <div class="card-body p-6">
            <h2 class="card-title text-lg font-bold flex items-center gap-2">
              <i data-lucide="github" class="w-5 h-5 text-primary" />
              <span>対象リポジトリ</span>
            </h2>
            <div class="skeleton h-12 w-full rounded-xl mt-2"></div>
          </div>
        </div>
      </div>

      {/* HTMXによる非同期メトリクス読み込みコンテナ */}
      <div hx-get="/ui/fragments/metrics" hx-trigger="load" hx-target="#metrics-container" hx-swap="outerHTML">
        <div id="metrics-container" class="space-y-8">
          
          {/* ローディング時スケルトン - 統計カード */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="skeleton h-32 w-full rounded-xl"></div>
            <div class="skeleton h-32 w-full rounded-xl"></div>
            <div class="skeleton h-32 w-full rounded-xl"></div>
          </div>

          {/* ローディング時スケルトン - 詳細セクション */}
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="card card-glass shadow-lg col-span-1">
              <div class="card-body items-center p-6">
                <h2 class="card-title text-lg font-bold opacity-75">現在のヘルススコア</h2>
                <div class="skeleton h-36 w-36 rounded-full my-4"></div>
              </div>
            </div>
            
            <div class="card card-glass shadow-lg col-span-1 lg:col-span-2">
              <div class="card-body p-6">
                <h2 class="card-title text-lg font-bold opacity-75">最近の修復アクティビティ</h2>
                <div class="space-y-3 mt-4">
                  <div class="skeleton h-6 w-3/4 rounded"></div>
                  <div class="skeleton h-6 w-full rounded"></div>
                  <div class="skeleton h-6 w-5/6 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* クイックアクションパネル (リッチ化のための追加セクション) */}
      <div class="mt-8">
        <h2 class="text-xl font-bold mb-4 opacity-75">クイックアクション</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <a href="/inspection" class="card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4">
            <div class="p-3 rounded-xl bg-primary/10 text-primary">
              <i data-lucide="search" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="font-bold text-sm">コードスキャン</div>
              <div class="text-xs opacity-50 mt-0.5">解析を実行する</div>
            </div>
          </a>
          
          <a href="/healing" class="card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4">
            <div class="p-3 rounded-xl bg-secondary/10 text-secondary">
              <i data-lucide="wrench" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="font-bold text-sm">自己修復</div>
              <div class="text-xs opacity-50 mt-0.5">修復ログを確認する</div>
            </div>
          </a>

          <a href="/code" class="card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4">
            <div class="p-3 rounded-xl bg-accent/10 text-accent">
              <i data-lucide="code" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="font-bold text-sm">コード編集</div>
              <div class="text-xs opacity-50 mt-0.5">AI セッションを開く</div>
            </div>
          </a>

          <a href="/settings" class="card card-glass hover:scale-[1.02] active:scale-[0.98] transition-all p-5 flex flex-row items-center gap-4">
            <div class="p-3 rounded-xl bg-neutral/20 text-base-content/85">
              <i data-lucide="settings" class="w-6 h-6"></i>
            </div>
            <div>
              <div class="font-bold text-sm">システム設定</div>
              <div class="text-xs opacity-50 mt-0.5">動作オプションを設定</div>
            </div>
          </a>
        </div>
      </div>
    </Layout>
  );
};
