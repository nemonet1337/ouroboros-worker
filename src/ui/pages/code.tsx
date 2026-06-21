import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface CodePageProps {
  user?: AuthedUser;
}

export const CodePage: FC<CodePageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Code Mode</h1>
      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">New Code Session</h2>
          <a href="/code/new" class="btn btn-primary btn-sm">Create Session</a>
        </div>
      </div>
      <div hx-get="/api/v1/code/sessions" hx-trigger="load" hx-target="this" hx-swap="innerHTML">
        <div class="skeleton h-32 w-full"></div>
      </div>
    </Layout>
  );
};
