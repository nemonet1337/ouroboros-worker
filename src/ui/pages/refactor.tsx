import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface RefactorPageProps {
  user?: AuthedUser;
}

export const RefactorPage: FC<RefactorPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content flex items-center gap-2">
          <i data-lucide="git-pull-request" class="w-8 h-8 text-primary" />
          <span>リファクタリング提案 (Refactor Mode)</span>
        </h1>
        <p class="text-sm opacity-60 mt-1">
          AI コード解析結果に基づき、自動生成された改善・リファクタリング提案の査読と適用コントロール
        </p>
      </div>

      {/* 提案一覧のHTMXロードコンテナ */}
      <div hx-get="/ui/fragments/refactor/proposals" hx-trigger="load" hx-target="this" hx-swap="innerHTML">
        {/* ローディング時スケルトン */}
        <div class="card card-glass p-6 space-y-4">
          <div class="skeleton h-8 w-1/4 rounded-lg"></div>
          <div class="space-y-2">
            <div class="skeleton h-12 w-full rounded-lg"></div>
            <div class="skeleton h-12 w-full rounded-lg"></div>
            <div class="skeleton h-12 w-full rounded-lg"></div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { RefactorPageProps };
