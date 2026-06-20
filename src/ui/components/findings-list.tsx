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

export const FindingsList: FC<FindingsListProps> = ({ findings }) => {
  const severityColor: Record<string, string> = {
    critical: "badge-error",
    high: "badge-warning",
    medium: "badge-info",
    low: "badge-ghost",
  };

  return (
    <div class="collapse collapse-arrow bg-base-100 rounded-box">
      {findings.map((f, i) => (
        <div key={f.id}>
          <input type="radio" name="findings-accordion" checked={i === 0} />
          <div class="collapse-title text-md font-medium flex items-center gap-2">
            <span class={`badge badge-sm ${severityColor[f.severity] || "badge-ghost"}`}>
              {f.severity}
            </span>
            {f.title}
          </div>
          <div class="collapse-content">
            <p class="text-sm text-base-content/80">{f.description}</p>
            <span class="badge badge-ghost badge-xs mt-2">{f.category}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
