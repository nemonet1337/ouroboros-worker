import type { FC } from "hono/jsx";

interface Metric {
  label: string;
  value: string | number;
  delta?: string;
  icon?: string;
  trend?: "up" | "down" | "neutral";
}

interface MetricsCardsProps {
  metrics: Metric[];
}

export const MetricsCards: FC<MetricsCardsProps> = ({ metrics }) => {
  // ラベルの日本語マッピング辞書
  const labelMap: Record<string, string> = {
    "Total Inspections": "総スキャン回数",
    "Open Findings": "未解決の検出事項",
    "Auto-healed Issues": "自動修復された課題",
    "Active Sessions": "アクティブセッション",
    "Security Score": "セキュリティスコア",
    "Success Rate": "自己修復成功率",
  };

  const getLocalizedLabel = (label: string) => {
    return labelMap[label] || label;
  };

  const getDeltaStyle = (delta: string) => {
    if (delta.startsWith("+") || delta.includes("改善") || delta.includes("上昇")) {
      return { class: "text-[#16A34A]", icon: "arrow-up-right" };
    }
    if (delta.startsWith("-") || delta.includes("悪化") || delta.includes("低下")) {
      return { class: "text-[#FF4040]", icon: "arrow-down-left" };
    }
    return { class: "text-base-content/50", icon: "minus" };
  };

  return (
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {metrics.map((m, index) => {
        const deltaInfo = m.delta ? getDeltaStyle(m.delta) : null;
        
        return (
          <div 
            key={m.label} 
            class="card card-glass shadow-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[#F6821F]/30 transition-all duration-300 overflow-hidden"
            style={`animation-delay: ${index * 100}ms`}
          >
            <div class="card-body p-6 flex flex-row items-center justify-between z-10">
              <div class="flex-1 min-w-0">
                <span class="text-xs font-semibold uppercase tracking-wider opacity-60 block truncate">
                  {getLocalizedLabel(m.label)}
                </span>
                <span class="text-3xl font-black tracking-tight text-base-content mt-2 block">
                  {m.value}
                </span>
                
                {m.delta && deltaInfo && (
                  <span class={`flex items-center gap-1 text-xs font-semibold mt-2 ${deltaInfo.class}`}>
                    <i data-lucide={deltaInfo.icon} class="w-3.5 h-3.5" />
                    <span>{m.delta}</span>
                  </span>
                )}
              </div>
              
              {m.icon && (
                <div class="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <i data-lucide={m.icon} class="w-6 h-6" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
