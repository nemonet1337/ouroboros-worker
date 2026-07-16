import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface RefactorProposalPageProps {
  inspectionId: string;
  user?: AuthedUser;
}

export const RefactorProposalPage: FC<RefactorProposalPageProps> = ({ inspectionId, user }) => {
  return (
    <Layout user={user}>
      {/* リファクタプロポーザル詳細のHTMX動的ロードコンテナ */}
      <div 
        hx-get={`/ui/fragments/inspections/${inspectionId}`}
        hx-trigger="load" 
        hx-target="this" 
        hx-swap="outerHTML"
      >
        {/* ローディング時プレースホルダー */}
        <div class="card card-glass p-8 space-y-6 animate-pulse">
          <div class="flex items-center justify-between border-b border-[var(--glass-border)] pb-4">
            <div class="space-y-2">
              <div class="skeleton h-8 w-64 rounded-lg"></div>
              <div class="skeleton h-4 w-48 rounded-lg"></div>
            </div>
            <div class="skeleton h-8 w-32 rounded-lg"></div>
          </div>
          
          <div class="space-y-4">
            <div class="skeleton h-28 w-full rounded-xl"></div>
            <div class="skeleton h-40 w-full rounded-xl"></div>
            <div class="skeleton h-12 w-1/3 rounded-xl"></div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { RefactorProposalPageProps };
