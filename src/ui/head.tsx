import type { FC } from "hono/jsx";
import { designTokens } from "./styles/design-tokens";
import { animations } from "./styles/animations";
import { components } from "./styles/components";

/**
 * Tailwind Play CDN には daisyUI プラグインが無いため、daisyUI のセマンティック
 * カラー（bg-base-300, text-primary 等）をそのままでは生成できない。
 * daisyUI 4 が定義する OKLCH CSS 変数（--p, --b1 など。design-tokens.ts が
 * テーマ別に上書きする）を Tailwind カラーへマッピングして補う。
 */
const tailwindConfig = `
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: "oklch(var(--p) / <alpha-value>)",
        "primary-content": "oklch(var(--pc) / <alpha-value>)",
        secondary: "oklch(var(--s) / <alpha-value>)",
        "secondary-content": "oklch(var(--sc) / <alpha-value>)",
        accent: "oklch(var(--a) / <alpha-value>)",
        "accent-content": "oklch(var(--ac) / <alpha-value>)",
        neutral: "oklch(var(--n) / <alpha-value>)",
        "neutral-content": "oklch(var(--nc) / <alpha-value>)",
        "base-100": "oklch(var(--b1) / <alpha-value>)",
        "base-200": "oklch(var(--b2) / <alpha-value>)",
        "base-300": "oklch(var(--b3) / <alpha-value>)",
        "base-content": "oklch(var(--bc) / <alpha-value>)",
        info: "oklch(var(--in) / <alpha-value>)",
        "info-content": "oklch(var(--inc) / <alpha-value>)",
        success: "oklch(var(--su) / <alpha-value>)",
        "success-content": "oklch(var(--suc) / <alpha-value>)",
        warning: "oklch(var(--wa) / <alpha-value>)",
        "warning-content": "oklch(var(--wac) / <alpha-value>)",
        error: "oklch(var(--er) / <alpha-value>)",
        "error-content": "oklch(var(--erc) / <alpha-value>)",
      },
    },
  },
};
`;

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

      {/* CSS ライブラリの読み込み。Play CDN は Tailwind v4 配信で壊れないようバージョン固定 */}
      <script src="https://cdn.tailwindcss.com/3.4.16"></script>
      <script dangerouslySetInnerHTML={{ __html: tailwindConfig }} />
      <link
        href="https://cdn.jsdelivr.net/npm/daisyui@4.12.23/dist/full.min.css"
        rel="stylesheet"
        type="text/css"
      />
      <script src="https://unpkg.com/htmx.org@2.0.8"></script>
      <script src="https://unpkg.com/lucide@0.408.0"></script>

      {/* ちらつき防止のための初期テーマ適用スクリプト */}
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />

      {/* カスタム CSS 注入 */}
      <style dangerouslySetInnerHTML={{ __html: designTokens + animations + components }} />
    </head>
  );
};
