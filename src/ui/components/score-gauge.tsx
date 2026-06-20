import type { FC } from "hono/jsx";

interface ScoreGaugeProps {
  score: number;
  grade?: string;
  size?: number;
}

export const ScoreGauge: FC<ScoreGaugeProps> = ({ score, grade, size = 120 }) => {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeWidth = 8;

  return (
    <div class="flex flex-col items-center gap-1">
      <svg width={size} height={size} class="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          stroke-width={strokeWidth}
          fill="transparent"
          class="text-base-300"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          stroke-width={strokeWidth}
          fill="transparent"
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          stroke-linecap="round"
          class={score >= 80 ? "text-success" : score >= 60 ? "text-warning" : "text-error"}
        />
      </svg>
      <div class="relative flex items-center justify-center" style={`width:${size}px;height:${size}px;margin-top:${-size}px`}>
        <div class="text-center">
          <div class="text-2xl font-bold">{score}</div>
          {grade && <div class="text-xs opacity-60">{grade}</div>}
        </div>
      </div>
    </div>
  );
};
