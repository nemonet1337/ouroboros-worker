import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";

interface SidebarProps {
  user?: AuthedUser;
}

export const Sidebar: FC<SidebarProps> = ({ user }) => {
  const links = [
    { href: "/", icon: "layout-dashboard", label: "ダッシュボード" },
    { href: "/healing", icon: "wrench", label: "自己修復" },
    { href: "/inspection", icon: "search", label: "コード解析" },
    { href: "/code", icon: "code", label: "コード編集" },
    { href: "/webhooks", icon: "webhook", label: "ウェブフック" },
    { href: "/settings", icon: "settings", label: "システム設定" },
  ];

  if (user?.role === "admin") {
    links.push({ href: "/admin", icon: "shield-check", label: "管理者パネル" });
  }

  return (
    <div class="drawer-side z-40 border-r border-[var(--glass-border)] bg-base-100">
      <label for="drawer-toggle" class="drawer-overlay"></label>
      <div class="flex flex-col h-full w-60 bg-base-100">
        {/* ロゴ部分 */}
        <div class="hidden lg:flex items-center gap-3 px-4 h-14 border-b border-[var(--glass-border)]">
          <div class="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-content font-bold text-sm">
            O
          </div>
          <span class="text-lg font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
            Ouroboros
          </span>
        </div>

        {/* メニューリンク */}
        <ul id="sidebar-menu" class="menu p-3 w-full flex-1 gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                class="sidebar-link gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200 hover:bg-base-200"
              >
                <i data-lucide={link.icon} class="w-4 h-4 opacity-70" />
                <span>{link.label}</span>
              </a>
            </li>
          ))}
        </ul>

        {/* フッター情報 */}
        <div class="p-3 border-t border-[var(--glass-border)] text-xs opacity-50 flex justify-between items-center bg-base-200">
          <span>Ouroboros Worker</span>
          <span id="sidebar-version">v2.0.0</span>
        </div>
      </div>

      {/* アクティブ状態付与用のクライアントスクリプト */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          const path = window.location.pathname;
          const links = document.querySelectorAll('.sidebar-link');
          links.forEach(link => {
            const href = link.getAttribute('href');
            if (href === path || (href !== '/' && path.startsWith(href))) {
              link.classList.add('nav-link-active');
              link.querySelector('i')?.classList.remove('opacity-70');
              link.querySelector('i')?.classList.add('text-primary');
            }
          });
        })();
      ` }} />
    </div>
  );
};
