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
    { href: "/models", icon: "cpu", label: "モデル設定" },
    { href: "/settings", icon: "settings", label: "システム設定" },
  ];

  if (user?.role === "admin") {
    links.push({ href: "/admin", icon: "shield-check", label: "管理者パネル" });
  }

  return (
    <div class="flex h-full w-60 flex-col bg-base-100">
      <div class="hidden h-14 items-center gap-3 border-b border-[var(--glass-border)] px-4 lg:flex">
        <div class="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-content">
          O
        </div>
        <span class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-lg font-bold tracking-wider text-transparent">
          Ouroboros
        </span>
      </div>

      <ul id="sidebar-menu" class="flex w-full flex-1 flex-col gap-1 p-3">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              class="sidebar-link flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-200 hover:bg-base-200"
            >
              <i data-lucide={link.icon} class="h-4 w-4 opacity-70" />
              <span>{link.label}</span>
            </a>
          </li>
        ))}
      </ul>

      <div class="flex items-center justify-between border-t border-[var(--glass-border)] bg-base-200 p-3 text-xs opacity-50">
        <span>Ouroboros Worker</span>
        <span id="sidebar-version">v2.0.0</span>
      </div>

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
