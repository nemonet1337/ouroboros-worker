import type { FC } from "hono/jsx";

export type Dimension = {
  label: string;
  score: number;
  color: string;
};

interface ScoreBreakdownProps {
  dimensions: Dimension[];
}

const DIM_COLORS: Record<string, string> = {
  security: "bg-error",
  performance: "bg-warning",
  redundancy: "bg-info",
  readability: "bg-primary",
  design: "bg-secondary",
  correctness: "bg-accent",
};

export const ScoreBreakdown: FC<ScoreBreakdownProps> = ({ dimensions }) => {
  return (
    <div class="space-y-3">
      {dimensions.map((d) => (
        <div key={d.label}>
          <div class="flex items-center justify-between text-sm mb-1">
            <span class="capitalize">{d.label}</span>
            <span class="font-bold">{d.score}</span>
          </div>
          <progress
            class={`progress ${DIM_COLORS[d.color] || "bg-primary"} w-full h-3`}
            value={d.score}
            max="100"
          />
        </div>
      ))}
    </div>
  );
};
