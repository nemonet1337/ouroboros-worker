import type { FC } from "hono/jsx";

const AXES: Array<{ key: string; label: string }> = [
  { key: "security", label: "セキュリティ" },
  { key: "correctness", label: "正確性" },
  { key: "performance", label: "パフォーマンス" },
  { key: "readability", label: "可読性" },
  { key: "design", label: "設計" },
  { key: "redundancy", label: "冗長性" },
];

interface RadarChartProps {
  scores: Record<string, number>;
  size?: number;
}

function polar(cx: number, cy: number, r: number, index: number, n: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

/** 6 次元スコアのレーダーチャート（依存ライブラリなしの SVG）。 */
export const RadarChart: FC<RadarChartProps> = ({ scores, size = 280 }) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.36;
  const n = AXES.length;
  const rings = [0.25, 0.5, 0.75, 1];

  const valuePoints = AXES.map((axis, i) => {
    const v = Math.max(0, Math.min(100, scores[axis.key] ?? 0)) / 100;
    return polar(cx, cy, maxR * v, i, n);
  });
  const polygon = valuePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      class="mx-auto overflow-visible"
      role="img"
      aria-label="6 次元スコアのレーダーチャート"
    >
      {rings.map((t) => {
        const pts = AXES.map((_, i) => polar(cx, cy, maxR * t, i, n));
        return (
          <polygon
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="currentColor"
            stroke-opacity="0.15"
            stroke-width="1"
          />
        );
      })}
      {AXES.map((_, i) => {
        const p = polar(cx, cy, maxR, i, n);
        return (
          <line
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="currentColor"
            stroke-opacity="0.2"
            stroke-width="1"
          />
        );
      })}
      <polygon
        points={polygon}
        fill="#6366f1"
        fill-opacity="0.35"
        stroke="#6366f1"
        stroke-width="2"
      />
      {AXES.map((axis, i) => {
        const p = polar(cx, cy, maxR + 18, i, n);
        const score = Math.round(scores[axis.key] ?? 0);
        return (
          <text
            x={p.x}
            y={p.y}
            text-anchor="middle"
            dominant-baseline="middle"
            class="fill-current text-[10px] font-semibold opacity-80"
          >
            {axis.label} {score}
          </text>
        );
      })}
    </svg>
  );
};
