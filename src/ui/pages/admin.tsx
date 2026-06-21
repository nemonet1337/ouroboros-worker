import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface AdminPageProps {
  user?: AuthedUser;
}

export const AdminPage: FC<AdminPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Admin</h1>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Logs</h2>
          <div
            hx-get="/api/v1/logs"
            hx-trigger="load"
            hx-target="#logs-list"
            hx-swap="innerHTML"
          >
            <div id="logs-list">
              <div class="skeleton h-48 w-full"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Configuration</h2>
          <div
            hx-get="/api/v1/config"
            hx-trigger="load"
            hx-target="#config-view"
            hx-swap="innerHTML"
          >
            <div id="config-view">
              <div class="skeleton h-48 w-full"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Registration</h2>
          <div
            hx-get="/api/v1/auth/registration"
            hx-trigger="load"
            hx-target="this"
            hx-swap="innerHTML"
          >
            <div class="skeleton h-12 w-full"></div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
