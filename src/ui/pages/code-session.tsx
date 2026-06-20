import type { FC } from "hono/jsx";
import { Layout } from "../layout";

interface CodeSessionPageProps {
  sessionId: string;
}

export const CodeSessionPage: FC<CodeSessionPageProps> = ({ sessionId }) => {
  return (
    <Layout>
      <div hx-get={`/api/v1/code/sessions/${sessionId}`} hx-trigger="load" hx-target="this" hx-swap="outerHTML">
        <div class="skeleton h-96 w-full"></div>
      </div>
    </Layout>
  );
};
