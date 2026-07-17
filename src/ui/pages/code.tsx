import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface CodePageProps {
  user?: AuthedUser;
}

export const CodePage: FC<CodePageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-base-content flex items-center gap-2">
            <i data-lucide="code" class="w-8 h-8 text-primary" />
            <span>コード編集セッション (Code Mode)</span>
          </h1>
          <p class="text-sm opacity-60 mt-1">
            リポジトリブランチ上で AI と対話しながら、コードの個別書き換え、コミット、検証、PR 作成を進めるセッション環境
          </p>
        </div>
        <a 
          href="/code/new" 
          class="btn btn-gradient rounded-xl px-5 py-3 h-auto gap-2 flex items-center justify-center self-start md:self-auto shadow-md"
        >
          <i data-lucide="plus-circle" class="w-5 h-5" />
          <span>セッションを開始</span>
        </a>
      </div>

      {/* セッション一覧 */}
      <div class="space-y-4">
        <h2 class="text-xl font-bold flex items-center gap-2 px-1">
          <i data-lucide="list-todo" class="w-5 h-5 text-secondary" />
          <span>稼働中のセッション一覧</span>
        </h2>
        
        <div hx-get="/ui/fragments/code/sessions" hx-trigger="load" hx-target="this" hx-swap="innerHTML">
          {/* 読み込み中のプレースホルダー */}
          <div class="card card-glass p-6 space-y-4">
            <div class="skeleton h-8 w-1/4 rounded-lg"></div>
            <div class="space-y-2">
              <div class="skeleton h-12 w-full rounded-lg"></div>
              <div class="skeleton h-12 w-full rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { CodePageProps };
