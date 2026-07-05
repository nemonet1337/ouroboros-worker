import type { FC } from "hono/jsx";
import { designTokens } from "./styles/design-tokens";
import { animations } from "./styles/animations";
import { components } from "./styles/components";

const themeInitScript = `
(function() {
  const savedTheme = localStorage.getItem('ouro-theme');
  const theme = savedTheme || 'winter';
  document.documentElement.setAttribute('data-theme', theme);
})();
`;

export interface AppHeadProps {
  title?: string;
}

/** layout.tsx / layout-public.tsx 共通の <head> 内容 */
export const AppHead: FC<AppHeadProps> = ({ title = "Ouroboros" }) => {
  return (
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>

      {/* ビルド済み Tailwind v4 + daisyUI 5（npm run build:css で生成、Worker が配信） */}
      <link href="/assets/tailwind.css" rel="stylesheet" type="text/css" />
      <script src="https://unpkg.com/htmx.org@2.0.8"></script>
      <script src="https://unpkg.com/lucide@0.408.0"></script>

      {/* ちらつき防止のための初期テーマ適用スクリプト */}
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />

      {/* カスタム CSS 注入 */}
      <style dangerouslySetInnerHTML={{ __html: designTokens + animations + components }} />
    </head>
  );
};
