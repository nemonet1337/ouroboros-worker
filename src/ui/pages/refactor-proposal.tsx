import type { FC } from "hono/jsx";
import { Layout } from "../layout";

interface RefactorProposalPageProps {
  inspectionId: string;
}

export const RefactorProposalPage: FC<RefactorProposalPageProps> = ({ inspectionId }) => {
  return (
    <Layout>
      <div hx-get={`/api/v1/inspections/${inspectionId}`} hx-trigger="load" hx-target="this" hx-swap="outerHTML">
        <div class="skeleton h-96 w-full"></div>
      </div>
    </Layout>
  );
};
