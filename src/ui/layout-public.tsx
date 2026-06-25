import type { FC, PropsWithChildren } from "hono/jsx";
import { designTokens } from "./styles/design-tokens";
import { animations } from "./styles/animations";
import { components } from "./styles/components";

export interface LayoutPublicProps {
  title?: string;
  wide?: boolean;
}

export const LayoutPublic: FC<PropsWithChildren<LayoutPublicProps>> = ({
  title = "Ouroboros",
  wide = false,
  children,
}) => {
  const mainClass = wide
    ? "flex-1 w-full"
    : "flex-1 p-4 md:p-8 max-w-lg mx-auto w-full flex flex-col justify-center min-h-screen animate-fade-in-up";

  return (
    <html lang="ja" data-theme="night">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Ouroboros</title>
        
        {/* CSS ライブラリの読み込み */}
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
        <main class={mainClass}>
          {children}
        </main>
        <script dangerouslySetInnerHTML={{ __html: `
          lucide.createIcons();
          
          // HTMX エラーレスポンス (400, 500等) でもスワップを許可する
          document.body.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;
            }
          });
          
          document.body.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });
        ` }} />
      </body>
    </html>
  );
};
