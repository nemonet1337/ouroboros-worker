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
      <div hx-get={`/api/v1/code/sessions/${sessionId}`} hx-trigger="load" hx-target="this" hx-swap="outerHTML">
        <div class="skeleton h-96 w-full"></div>
      </div>
    </Layout>
  );
};
