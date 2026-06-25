import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface CodeSessionPageProps {
  sessionId: string;
  user?: AuthedUser;
}

export const CodeSessionPage: FC<CodeSessionPageProps> = ({ sessionId, user }) => {
  return (
    <Layout user={user}>
      {/* セッション詳細のHTMX動的ロードコンテナ */}
      <div 
        hx-get={`/api/v1/code/sessions/${sessionId}`} 
        hx-trigger="load" 
        hx-target="this" 
        hx-swap="outerHTML"
      >
        {/* ローディング表示 */}
        <div class="card card-glass shadow-lg p-8 space-y-6 animate-pulse">
          <div class="flex items-center justify-between border-b border-[var(--glass-border)] pb-4">
            <div class="space-y-2">
              <div class="skeleton h-8 w-64 rounded-lg"></div>
              <div class="skeleton h-4 w-40 rounded-lg"></div>
            </div>
            <div class="skeleton h-8 w-24 rounded-lg"></div>
          </div>
          
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-4">
              <div class="skeleton h-24 w-full rounded-xl"></div>
              <div class="skeleton h-48 w-full rounded-xl"></div>
            </div>
            <div class="lg:col-span-1 space-y-4">
              <div class="skeleton h-32 w-full rounded-xl"></div>
              <div class="skeleton h-32 w-full rounded-xl"></div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { CodeSessionPageProps };
