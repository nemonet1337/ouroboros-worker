import type { FC } from "hono/jsx";

export interface FindingItem {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
}

interface FindingsListProps {
  findings: FindingItem[];
}

// 深刻度設定マッピング
const SEVERITY_CONFIG: Record<string, { label: string; badgeClass: string; borderClass: string; icon: string }> = {
  critical: { label: "致命的", badgeClass: "badge-error text-error-content", borderClass: "border-l-4 border-l-error", icon: "alert-octagon" },
  high: { label: "高", badgeClass: "bg-orange-500 text-white border-orange-500", borderClass: "border-l-4 border-l-orange-500", icon: "alert-triangle" },
  medium: { label: "中", badgeClass: "badge-info text-info-content", borderClass: "border-l-4 border-l-info", icon: "info" },
  low: { label: "低", badgeClass: "badge-ghost opacity-75", borderClass: "border-l-4 border-l-base-content/20", icon: "help-circle" },
};

// カテゴリマッピング（英語から日本語）
const CATEGORY_MAP: Record<string, string> = {
  security: "セキュリティ",
  performance: "パフォーマンス",
  bug: "バグ・正確性",
  style: "コードスタイル",
  design: "設計・構造",
  redundancy: "冗長コード",
};

export const FindingsList: FC<FindingsListProps> = ({ findings }) => {
  if (!findings || findings.length === 0) {
    return (
      <div class="card card-glass p-8 text-center text-base-content/50">
        <i data-lucide="check-circle" class="w-12 h-12 mx-auto text-emerald-500/50 mb-3" />
        <p class="font-bold">検出された問題はありません</p>
        <p class="text-xs opacity-75 mt-1">コードベースは良好な状態です。</p>
      </div>
    );
  }

  return (
    <div class="space-y-3">
      {findings.map((f, i) => {
        const severityKey = f.severity.toLowerCase();
        const config = SEVERITY_CONFIG[severityKey] || {
          label: f.severity,
          badgeClass: "badge-ghost",
          borderClass: "border-l-4 border-l-base-content/10",
          icon: "alert-circle"
        };
        const localizedCategory = CATEGORY_MAP[f.category.toLowerCase()] || f.category;

        return (
          <details
            key={f.id}
            class={`card-glass overflow-hidden transition-all duration-200 hover:shadow-md ${config.borderClass}`}
            open={i === 0}
          >
            <summary class="flex cursor-pointer list-none items-center gap-3 py-4 pr-4 text-base font-semibold [&::-webkit-details-marker]:hidden">
              <span class={`badge badge-sm flex items-center gap-1 rounded-full px-2 py-0.5 font-black ${config.badgeClass}`}>
                <i data-lucide={config.icon} class="h-3.5 w-3.5" />
                <span>{config.label}</span>
              </span>
              <span class="truncate tracking-wide text-base-content">{f.title}</span>
            </summary>
            <div class="border-t border-[var(--glass-border)]/5 bg-base-200/20 px-6 pb-5 pt-0">
              <div class="space-y-3 pt-4 text-sm leading-relaxed text-base-content/85">
                <p>{f.description}</p>
                <div class="flex items-center gap-2 pt-2">
                  <span class="text-xs opacity-50">カテゴリ:</span>
                  <span class="badge badge-outline badge-sm rounded-full px-2 text-xs font-semibold">
                    {localizedCategory}
                  </span>
                </div>
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
};
