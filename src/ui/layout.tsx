import type { FC, PropsWithChildren } from "hono/jsx";
import type { AuthedUser } from "../auth/service";

export interface LayoutProps {
  user?: AuthedUser;
  flash?: { type: "success" | "error"; message: string };
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ user, flash, children }) => {
  return (
    <html lang="ja" data-theme="night">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Ouroboros</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@5.0.0-beta.2/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://unpkg.com/htmx.org@2.0.8"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>{`body { font-family: system-ui, -apple-system, sans-serif; }`}</style>
      </head>
      <body class="min-h-screen bg-base-300">
        <div class="drawer lg:drawer-open">
          <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />
          <div class="drawer-content flex flex-col">
            <div class="navbar bg-primary text-primary-content px-4">
              <div class="flex-none lg:hidden">
                <label for="drawer-toggle" class="btn btn-square btn-ghost btn-sm">
                  <i data-lucide="menu" class="w-5 h-5"></i>
                </label>
              </div>
              <div class="flex-1">
                <a href="/" class="btn btn-ghost text-xl font-bold tracking-tight">
                  Ouroboros
                </a>
              </div>
              <div class="flex-none gap-2">
                {user ? (
                  <div class="dropdown dropdown-end">
                    <button class="btn btn-ghost btn-sm avatar">
                      <div class="w-8 rounded-full bg-secondary text-secondary-content flex items-center justify-center font-bold">
                        {user.email[0].toUpperCase()}
                      </div>
                    </button>
                    <div class="dropdown-content menu z-50 bg-base-100 rounded-box w-52 p-2 shadow-lg">
                      <li class="menu-title">
                        <span>{user.email}</span>
                        <span class="text-xs opacity-60">{user.role}</span>
                      </li>
                      <li>
                        <a href="/settings">Settings</a>
                      </li>
                      {user.role === "admin" && (
                        <li>
                          <a href="/admin">Admin</a>
                        </li>
                      )}
                      <li>
                        <button hx-post="/api/v1/auth/logout" hx-redirect="/login" hx-swap="none">
                          Logout
                        </button>
                      </li>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <main class="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
              {flash && (
                <div class="alert mb-4">
                  <span>{flash.message}</span>
                </div>
              )}
              {children}
            </main>
          </div>
          <div class="drawer-side z-40">
            <label for="drawer-toggle" class="drawer-overlay"></label>
            <ul class="menu p-4 w-80 min-h-full bg-base-100 text-base-content">
              <li>
                <a href="/" class="font-semibold">
                  <i data-lucide="layout-dashboard" class="w-4 h-4"></i> Dashboard
                </a>
              </li>
              <li>
                <a href="/healing">Self Healing</a>
              </li>
              <li>
                <a href="/inspection">Inspection</a>
              </li>
              <li>
                <a href="/code">Code Mode</a>
              </li>
              <li>
                <a href="/refactor">Refactor Mode</a>
              </li>
              <li>
                <a href="/webhooks">Webhooks</a>
              </li>
              <li>
                <a href="/tokens">API Tokens</a>
              </li>
              <li>
                <a href="/settings">Settings</a>
              </li>
              {user?.role === "admin" && (
                <li>
                  <a href="/admin">Admin</a>
                </li>
              )}
            </ul>
          </div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: "lucide.createIcons();" }} />
      </body>
    </html>
  );
};
