import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface HealingPageProps {
  user?: AuthedUser;
}

export const HealingPage: FC<HealingPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Self Healing</h1>
      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Manual Trigger</h2>
          <div class="flex gap-2">
            <button
              class="btn btn-primary"
              hx-post="/api/v1/healing"
              hx-vals='{"dryRun":false}'
              hx-target="#healing-result"
              hx-swap="innerHTML"
            >
              Run Full Healing
            </button>
            <button
              class="btn btn-outline"
              hx-post="/api/v1/healing"
              hx-vals='{"dryRun":true}'
              hx-target="#healing-result"
              hx-swap="innerHTML"
            >
              Dry Run
            </button>
          </div>
          <div id="healing-result" class="mt-2"></div>
        </div>
      </div>
      <div hx-get="/api/v1/healing" hx-trigger="load" hx-target="#healing-runs" hx-swap="innerHTML">
        <div id="healing-runs">
          <div class="skeleton h-64 w-full"></div>
        </div>
      </div>
    </Layout>
  );
};
