import type { FC, PropsWithChildren } from "hono/jsx";
import type { AuthedUser } from "../auth/service";
import { Sidebar } from "./components/sidebar";
import { designTokens } from "./styles/design-tokens";
import { animations } from "./styles/animations";
import { components } from "./styles/components";

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
        
        {/* CSS ライブラリの読み込み (DaisyUI 4.x & Tailwind) */}
        <script src="https://cdn.tailwindcss.com"></script>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@4.12.23/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://unpkg.com/htmx.org@2.0.8"></script>
        <script src="https://unpkg.com/lucide@0.408.0"></script>

        {/* ちらつき防止のための初期テーマ適用スクリプト */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const savedTheme = localStorage.getItem('ouro-theme');
            const theme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'winter' : 'night');
            document.documentElement.setAttribute('data-theme', theme);
          })();
        ` }} />

        {/* カスタム CSS 注入 */}
        <style dangerouslySetInnerHTML={{ __html: designTokens + animations + components }} />
      </head>
      <body class="min-h-screen bg-base-300 transition-colors duration-200">
        <div class="drawer lg:drawer-open">
          <input id="drawer-toggle" type="checkbox" class="drawer-toggle" />
          <div class="drawer-content flex flex-col min-h-screen">
            
            {/* ナビゲーションバー (ヘッダー) */}
            <div class="navbar bg-base-100/80 backdrop-blur-md sticky top-0 z-30 px-4 border-b border-[var(--glass-border)] h-16">
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
              
              {/* 右側のコントロール群 */}
              <div class="flex-none ml-auto gap-2">
                {/* テーマ切り替えトグル */}
                <button id="theme-toggle" class="btn btn-ghost btn-sm btn-circle" aria-label="テーマ切替">
                  <i data-lucide="sun" class="w-5 h-5 hidden dark-icon" />
                  <i data-lucide="moon" class="w-5 h-5 hidden light-icon" />
                </button>

                {/* ユーザープロフィール */}
                {user ? (
                  <div class="dropdown dropdown-end">
                    <button class="btn btn-ghost btn-sm avatar gap-2 normal-case">
                      <div class="w-8 h-8 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold">
                        {user.email[0].toUpperCase()}
                      </div>
                      <span class="hidden md:inline text-xs opacity-75">{user.email.split('@')[0]}</span>
                    </button>
                    <div class="dropdown-content menu z-50 bg-base-100 rounded-xl w-60 p-2 mt-2 shadow-2xl border border-[var(--glass-border)]">
                      <li class="menu-title px-4 py-2 border-b border-[var(--glass-border)]">
                        <span class="font-semibold text-base-content truncate block">{user.email}</span>
                        <span class="text-xs font-normal opacity-60">ロール: {user.role === 'admin' ? '管理者' : '一般ユーザー'}</span>
                      </li>
                      <li class="mt-1">
                        <a href="/settings" class="gap-2">
                          <i data-lucide="settings" class="w-4 h-4" /> システム設定
                        </a>
                      </li>
                      {user.role === "admin" && (
                        <li>
                          <a href="/admin" class="gap-2">
                            <i data-lucide="shield-check" class="w-4 h-4" /> 管理者パネル
                          </a>
                        </li>
                      )}
                      <li class="border-t border-[var(--glass-border)] mt-1 pt-1">
                        <button
                          hx-post="/api/v1/auth/logout"
                          hx-redirect="/login"
                          hx-swap="none"
                          class="gap-2 text-error hover:bg-error/10"
                        >
                          <i data-lucide="log-out" class="w-4 h-4" /> ログアウト
                        </button>
                      </li>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* メインコンテンツ */}
            <main class="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full animate-fade-in-up">
              {flash && (
                <div class={`alert ${flash.type === 'success' ? 'alert-success' : 'alert-error'} shadow-lg mb-6 rounded-xl animate-fade-in-up`}>
                  <i data-lucide={flash.type === 'success' ? 'check-circle' : 'alert-triangle'} class="w-5 h-5" />
                  <span>{flash.message}</span>
                </div>
              )}
              {children}
            </main>
          </div>

          {/* 共通サイドバー */}
          <Sidebar user={user} />
        </div>

        {/* アイコン初期化 & テーマ切替スクリプト */}
        <script dangerouslySetInnerHTML={{ __html: `
          // Lucide アイコン初期化
          lucide.createIcons();
          document.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });

          // HTMX エラーレスポンス (400, 500等) でもスワップを許可する
          document.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;

              // レスポンスが JSON の場合、HTMLのアラート通知に変換してスワップさせる
              const contentType = evt.detail.xhr.getResponseHeader("Content-Type");
              if (contentType && contentType.includes("application/json")) {
                try {
                  const responseObj = JSON.parse(evt.detail.xhr.responseText);
                  const errorMsg = responseObj.error?.message || "エラーが発生しました。";
                  const details = responseObj.error?.details ? " : " + responseObj.error.details.join(", ") : "";
                  
                  // serverResponseをHTMLで上書きしてHTMXにスワップさせる
                  evt.detail.serverResponse = '<div class="alert alert-error shadow-lg rounded-xl flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>' + errorMsg + details + '</span></div>';
                } catch (e) {
                  // パース失敗時のフォールバック
                }
              }
            }
          });

          // テーマ切り替え機能
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
        ` }} />
      </body>
    </html>
  );
};
