import type { FC } from "hono/jsx";

interface SidebarProps {
  current?: string;
}

export const Sidebar: FC<SidebarProps> = ({ current }) => {
  const links = [
    { href: "/", icon: "layout-dashboard", label: "Dashboard" },
    { href: "/healing", icon: "wrench", label: "Self Healing" },
    { href: "/inspection", icon: "scan-search", label: "Inspection" },
    { href: "/code", icon: "code-2", label: "Code Mode" },
    { href: "/refactor", icon: "refresh-cw", label: "Refactor" },
    { href: "/webhooks", icon: "webhook", label: "Webhooks" },
    { href: "/tokens", icon: "key", label: "API Tokens" },
    { href: "/settings", icon: "settings", label: "Settings" },
  ];

  return (
    <aside class="w-64 bg-base-100 h-screen sticky top-0">
      <ul class="menu p-4 w-full min-h-full gap-1">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              class={`gap-3 ${current === link.href ? "active" : ""}`}
            >
              <i data-lucide={link.icon} class="w-4 h-4" />
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
};
