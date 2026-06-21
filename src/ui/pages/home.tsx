import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";
import { MetricsCards } from "../components/metrics-cards";
import { ScoreGauge } from "../components/score-gauge";

interface HomePageProps {
  user?: AuthedUser;
}

export const HomePage: FC<HomePageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
      <div hx-get="/api/v1/metrics" hx-trigger="load" hx-target="#metrics-container" hx-swap="innerHTML">
        <div id="metrics-container">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="skeleton h-24 w-full"></div>
            <div class="skeleton h-24 w-full"></div>
            <div class="skeleton h-24 w-full"></div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
            <div class="card bg-base-100 shadow-lg col-span-1">
              <div class="card-body items-center">
                <h2 class="card-title">Last Score</h2>
                <div class="skeleton h-32 w-32 rounded-full"></div>
              </div>
            </div>
            <div class="card bg-base-100 shadow-lg col-span-1 lg:col-span-2">
              <div class="card-body">
                <h2 class="card-title">Recent Activity</h2>
                <div class="skeleton h-32 w-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
