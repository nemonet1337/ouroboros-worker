import type { FC, PropsWithChildren } from "hono/jsx";
import type { AuthedUser } from "../auth/service";
import { Sidebar } from "./components/sidebar";
import { AppHead } from "./head";

export interface LayoutProps {
  user?: AuthedUser;
  flash?: { type: "success" | "error"; message: string };
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ user, flash, children }) => {
  return (
    <html lang="ja" data-theme="winter">
      <AppHead />
      <body class="min-h-screen bg-base-300 transition-colors duration-200">
        <div class="flex min-h-screen">
          <input id="drawer-toggle" type="checkbox" class="peer/drawer sr-only" />
          <label
            for="drawer-toggle"
            class="fixed inset-0 z-30 hidden bg-black/50 peer-checked/drawer:block lg:hidden"
          ></label>
          <aside class="fixed inset-y-0 left-0 z-40 flex w-60 -translate-x-full flex-col border-r border-[var(--glass-border)] bg-base-100 transition-transform duration-200 peer-checked/drawer:translate-x-0 lg:static lg:translate-x-0">
            <Sidebar user={user} />
          </aside>

          <div class="flex min-h-screen min-w-0 flex-1 flex-col">
            <header class="sticky top-0 z-20 flex h-14 items-center border-b border-[var(--glass-border)] bg-base-100 px-4">
              <div class="flex-none lg:hidden">
                <label for="drawer-toggle" class="btn btn-square btn-ghost btn-sm">
                  <i data-lucide="menu" class="w-5 h-5"></i>
                </label>
              </div>
              <div class="flex-1 lg:hidden">
                <a href="/" class="btn btn-ghost text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                  Ouroboros
                </a>
              </div>

              <div class="ml-auto flex flex-none items-center gap-2">
                <span id="version-badge" class="hidden rounded-full bg-base-200 px-2 py-0.5 font-mono text-xs text-base-content/60"></span>

                {user && (
                  <div
                    hx-get="/ui/fragments/notifications"
                    hx-trigger="load, every 10s"
                    hx-swap="innerHTML"
                  ></div>
                )}

                <button id="theme-toggle" class="btn btn-ghost btn-sm btn-circle" aria-label="テーマ切替">
                  <i data-lucide="sun" class="w-5 h-5 hidden dark-icon" />
                  <i data-lucide="moon" class="w-5 h-5 hidden light-icon" />
                </button>

                {user ? (
                  <details class="relative">
                    <summary class="btn btn-ghost btn-sm flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <div class="flex size-8 items-center justify-center rounded-full bg-primary font-bold text-primary-content">
                        {user.email[0].toUpperCase()}
                      </div>
                      <span class="hidden text-xs opacity-75 md:inline">{user.email.split('@')[0]}</span>
                    </summary>
                    <div class="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-[var(--glass-border)] bg-base-100 p-2 shadow-2xl">
                      <div class="border-b border-[var(--glass-border)] px-4 py-2">
                        <span class="block truncate font-semibold text-base-content">{user.email}</span>
                        <span class="text-xs font-normal opacity-60">ロール: {user.role === 'admin' ? '管理者' : '一般ユーザー'}</span>
                      </div>
                      <a href="/models" class="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200">
                        <i data-lucide="cpu" class="w-4 h-4" /> モデル設定
                      </a>
                      <a href="/settings" class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200">
                        <i data-lucide="settings" class="w-4 h-4" /> システム設定
                      </a>
                      {user.role === "admin" && (
                        <a href="/admin" class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-base-200">
                          <i data-lucide="shield-check" class="w-4 h-4" /> 管理者パネル
                        </a>
                      )}
                      <div class="mt-1 border-t border-[var(--glass-border)] pt-1">
                        <button
                          hx-post="/api/v1/auth/logout"
                          hx-redirect="/login"
                          hx-swap="none"
                          class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-error hover:bg-error/10"
                        >
                          <i data-lucide="log-out" class="w-4 h-4" /> ログアウト
                        </button>
                      </div>
                    </div>
                  </details>
                ) : null}
              </div>
            </header>

            <main class="mx-auto w-full max-w-7xl flex-1 animate-fade-in-up p-4 md:p-8">
              {flash && (
                <div class={`alert ${flash.type === 'success' ? 'alert-success' : 'alert-error'} mb-6 rounded-lg shadow-lg animate-fade-in-up`}>
                  <i data-lucide={flash.type === 'success' ? 'check-circle' : 'alert-triangle'} class="w-5 h-5" />
                  <span>{flash.message}</span>
                </div>
              )}
              {children}
            </main>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          lucide.createIcons();
          document.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });

          document.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;

              const contentType = evt.detail.xhr.getResponseHeader("Content-Type");
              if (contentType && contentType.includes("application/json")) {
                try {
                  const responseObj = JSON.parse(evt.detail.xhr.responseText);
                  const errorMsg = responseObj.error?.message || "エラーが発生しました。";
                  const details = responseObj.error?.details ? " : " + responseObj.error.details.join(", ") : "";

                  evt.detail.serverResponse = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>' + errorMsg + details + '</span></div>';
                } catch (e) {
                }
              }
            }
          });

          (function() {
            const toggleBtn = document.getElementById('theme-toggle');
            if (!toggleBtn) return;

            const getTheme = () => document.documentElement.getAttribute('data-theme');

            const updateToggleIcons = (theme) => {
              const sunIcon = toggleBtn.querySelector('.dark-icon');
              const moonIcon = toggleBtn.querySelector('.light-icon');
              if (theme === 'winter') {
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
              } else {
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
              }
            };

            const currentTheme = getTheme();
            updateToggleIcons(currentTheme);

            toggleBtn.addEventListener('click', () => {
              const newTheme = getTheme() === 'night' ? 'winter' : 'night';
              document.documentElement.setAttribute('data-theme', newTheme);
              localStorage.setItem('ouro-theme', newTheme);
              updateToggleIcons(newTheme);
            });
          })();

          (async () => {
            try {
              const res = await fetch('/api/v1/version');
              if (!res.ok) return;
              const data = await res.json();
              if (data.versionMetadata?.tag) {
                const badge = document.getElementById('version-badge');
                if (badge) {
                  badge.textContent = data.versionMetadata.tag;
                  badge.classList.remove('hidden');
                }
              }
            } catch {}
          })();
        ` }} />
      </body>
    </html>
  );
};
