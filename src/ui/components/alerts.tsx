import type { FC } from "hono/jsx";

interface AlertItem {
  type: "success" | "error" | "warning" | "info";
  message: string;
}

interface AlertsProps {
  items: AlertItem[];
  dismissible?: boolean;
}

export const Alerts: FC<AlertsProps> = ({ items, dismissible = true }) => {
  if (!items.length) return null;

  const iconMap: Record<string, string> = {
    success: "check-circle",
    error: "alert-circle",
    warning: "alert-triangle",
    info: "info",
  };

  return (
    <div class="space-y-2 mb-4">
      {items.map((item, idx) => (
        <div key={idx} class={`alert alert-${item.type}`}>
          <i data-lucide={iconMap[item.type]} class="w-5 h-5" />
          <span>{item.message}</span>
          {dismissible && (
            <button class="btn btn-ghost btn-xs" hx-delete="/api/v1/ui/flash" hx-swap="none">
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
