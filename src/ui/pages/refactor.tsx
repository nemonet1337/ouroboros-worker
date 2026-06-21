import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface RefactorPageProps {
  user?: AuthedUser;
}

export const RefactorPage: FC<RefactorPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Refactor Mode</h1>
      <div hx-get="/api/v1/refactor/proposals" hx-trigger="load" hx-target="this" hx-swap="innerHTML">
        <div class="skeleton h-32 w-full"></div>
      </div>
    </Layout>
  );
};
