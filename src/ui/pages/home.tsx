import type { FC } from "hono/jsx";
import { Layout } from "../layout";
import { MetricsCards } from "../components/metrics-cards";
import { ScoreGauge } from "../components/score-gauge";

const sampleMetrics = [
  { label: "Active Sessions", value: 12, icon: "activity" },
  { label: "Run Today", value: 5, icon: "play", delta: "+2 from yesterday" },
  { label: "Avg Score", value: "B+", icon: "gauge" },
];

export const HomePage: FC = () => {
  return (
    <Layout>
      <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
      <MetricsCards metrics={sampleMetrics} />

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        <div class="card bg-base-100 shadow-lg col-span-1">
          <div class="card-body items-center">
            <h2 class="card-title">Last Score</h2>
            <ScoreGauge score={78} grade="B+" size={140} />
          </div>
        </div>
        <div class="card bg-base-100 shadow-lg col-span-1 lg:col-span-2">
          <div class="card-body">
            <h2 class="card-title">Recent Activity</h2>
            <ul class="timeline timeline-compact timeline-vertical">
              <li>
                <div class="timeline-start">2h ago</div>
                <div class="timeline-middle">●</div>
                <div class="timeline-end timeline-box">Healing run #104 completed</div>
              </li>
              <li>
                <div class="timeline-start">5h ago</div>
                <div class="timeline-middle">●</div>
                <div class="timeline-end timeline-box">Inspection on main finished (A)</div>
              </li>
              <li>
                <div class="timeline-start">1d ago</div>
                <div class="timeline-middle">●</div>
                <div class="timeline-end timeline-box">Dependency update PR merged</div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
};
