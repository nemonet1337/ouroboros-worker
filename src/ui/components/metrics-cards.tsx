import type { FC } from "hono/jsx";

interface Metric {
  label: string;
  value: string | number;
  delta?: string;
  icon?: string;
}

interface MetricsCardsProps {
  metrics: Metric[];
}

export const MetricsCards: FC<MetricsCardsProps> = ({ metrics }) => {
  return (
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      {metrics.map((m) => (
        <div key={m.label} class="stats shadow bg-base-100">
          <div class="stat">
            {m.icon && (
              <div class="stat-figure text-primary">
                <i data-lucide={m.icon} class="w-8 h-8" />
              </div>
            )}
            <div class="stat-title">{m.label}</div>
            <div class="stat-value text-2xl">{m.value}</div>
            {m.delta && <div class="stat-desc text-success">{m.delta}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};
