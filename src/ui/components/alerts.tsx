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

  const iconMap: Record<AlertItem["type"], string> = {
    success: "check-circle",
    error: "alert-circle",
    warning: "alert-triangle",
    info: "info",
  };

  const alertClassMap: Record<AlertItem["type"], string> = {
    success: "bg-emerald-600 text-white border-emerald-700",
    error: "bg-rose-600 text-white border-rose-700",
    warning: "bg-amber-600 text-white border-amber-700",
    info: "bg-sky-600 text-white border-sky-700",
  };

  return (
    <div class="toast toast-top toast-end z-50 p-4 space-y-3 min-w-[320px]">
      {items.map((item, idx) => (
        <div 
          key={idx} 
          class={`alert ${alertClassMap[item.type]} shadow-2xl rounded-xl flex items-center justify-between gap-4 border p-4 animate-fade-in-up transition-all duration-300 alert-item-toast`}
          style={`animation-delay: ${idx * 100}ms;`}
        >
          <div class="flex items-center gap-2.5">
            <i data-lucide={iconMap[item.type]} class="w-5 h-5 flex-shrink-0" />
            <span class="text-sm font-semibold tracking-wide leading-snug">{item.message}</span>
          </div>
          
          {dismissible && (
            <button 
              type="button"
              class="btn btn-ghost btn-circle btn-xs hover:bg-base-content/10 transition-colors opacity-75 hover:opacity-100 flex-shrink-0"
              onclick="this.closest('.alert-item-toast').remove()"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      
      {/* 5秒後にトーストを自動でフェードアウトして消すクライアントスクリプト */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          const toasts = document.querySelectorAll('.alert-item-toast');
          toasts.forEach(toast => {
            setTimeout(() => {
              toast.style.opacity = '0';
              toast.style.transform = 'translateY(-10px)';
              setTimeout(() => {
                toast.remove();
              }, 300);
            }, 5000);
          });
        })();
      ` }} />
    </div>
  );
};
export { AlertItem, AlertsProps };
