export const designTokens = `
:root {
  /* フォント定義 */
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;

  /* スペーシング */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;

  /* 角丸 */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  /* トランジション */
  --transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Google Fonts Inter インポート */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

body {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* テーマカラー（旧 daisyUI 4 の --p/--b1 等の上書き）は
   src/ui/styles/tailwind.source.css の @plugin "daisyui/theme" 定義へ移行済み */

/* ============================================
   テーマ別カスタム変数: ライト (winter)
   ============================================ */
[data-theme="winter"] {
  --glass-bg: #FFFFFF;
  --glass-border: #E2E2E2;
  --glass-glow: transparent;
  --gradient-accent: linear-gradient(135deg, #F6821F 0%, #FBAD41 100%);
  --sidebar-active-bg: rgba(246, 130, 31, 0.12);
  --sidebar-active-border: #F6821F;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  --input-focus-border: #F6821F;
  --input-focus-shadow: 0 0 0 3px rgba(246, 130, 31, 0.2);

  background: #F0F0F0;
  background-attachment: fixed;
}

/* ============================================
   テーマ別カスタム変数: ダーク (night)
   ============================================ */
[data-theme="night"] {
  --glass-bg: #1D1D1D;
  --glass-border: #2E2E2E;
  --glass-glow: transparent;
  --gradient-accent: linear-gradient(135deg, #F6821F 0%, #FBAD41 100%);
  --sidebar-active-bg: rgba(246, 130, 31, 0.16);
  --sidebar-active-border: #F6821F;
  --card-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  --input-focus-border: #F6821F;
  --input-focus-shadow: 0 0 0 3px rgba(246, 130, 31, 0.2);

  background: #0C0D11;
  background-attachment: fixed;
}
`;
