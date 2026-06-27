import type { FC } from "hono/jsx";

export type Dimension = {
  label: string;
  score: number;
  color: string;
};

interface ScoreBreakdownProps {
  dimensions: Dimension[];
}

// 次元ごとの日本語表示名、アイコン、およびカラーマップ
const DIMENSION_CONFIG: Record<string, { label: string; icon: string; progressClass: string; textClass: string }> = {
  security: { label: "セキュリティ", icon: "shield", progressClass: "progress-error", textClass: "text-error" },
  correctness: { label: "正確性", icon: "check-square", progressClass: "progress-accent", textClass: "text-accent" },
  performance: { label: "パフォーマンス", icon: "zap", progressClass: "progress-warning", textClass: "text-warning" },
  readability: { label: "可読性", icon: "eye", progressClass: "progress-info", textClass: "text-info" },
  design: { label: "設計・構造", icon: "layout", progressClass: "progress-secondary", textClass: "text-secondary" },
  redundancy: { label: "冗長性の排除", icon: "layers", progressClass: "progress-primary", textClass: "text-primary" },
};

export const ScoreBreakdown: FC<ScoreBreakdownProps> = ({ dimensions }) => {
  return (
    <div class="space-y-4 select-none">
      {dimensions.map((d, index) => {
        // キー名を小文字にしてマッピング
        const key = d.label.toLowerCase();
        const config = DIMENSION_CONFIG[key] || {
          label: d.label,
          icon: "help-circle",
          progressClass: "progress-neutral",
          textClass: "text-neutral"
        };

        return (
          <div 
            key={d.label} 
            class="group animate-fade-in-up"
            style={`animation-delay: ${index * 60}ms`}
          >
            <div class="flex items-center justify-between text-sm mb-1.5 px-0.5">
              <span class="flex items-center gap-2 font-medium opacity-85 group-hover:opacity-100 transition-opacity">
                <i data-lucide={config.icon} class={`w-4 h-4 ${config.textClass}`} />
                <span>{config.label}</span>
              </span>
              <span class={`font-black ${config.textClass}`}>{d.score}</span>
            </div>
            
            {/* プログレスバーのカスタマイズ */}
            <div class="relative w-full h-2.5 bg-base-300 rounded-full overflow-hidden border border-[var(--glass-border)]">
              <div 
                class={`h-full rounded-full bg-current ${config.textClass} transition-all duration-1000 ease-out`}
                style={`width: ${d.score}%; transition: width 1s ease-out;`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
