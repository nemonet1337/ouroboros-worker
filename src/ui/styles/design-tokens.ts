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

/* ============================================
   DaisyUI 変数上書き: ライトテーマ (winter)
   ============================================ */
:root[data-theme="winter"] {
  --p: 72% 0.165 57;
  --pf: 68% 0.165 49;
  --pc: 100% 0 0;
  --s: 78% 0.15 75;
  --sc: 19% 0 0;
  --a: 64% 0.2 38;
  --ac: 100% 0 0;
  --n: 32% 0 0;
  --nc: 100% 0 0;
  --b1: 100% 0 0;
  --b2: 97% 0 0;
  --b3: 95% 0 0;
  --bc: 19% 0 0;
  --in: 55.5% 0.2 265;
  --inc: 100% 0 0;
  --su: 62% 0.17 150;
  --suc: 100% 0 0;
  --wa: 77% 0.15 75;
  --wac: 19% 0 0;
  --er: 60% 0.255 26;
  --erc: 100% 0 0;
  --rounded-box: 0.375rem;
  --rounded-btn: 0.375rem;
  --rounded-badge: 0.25rem;
}

/* ============================================
   DaisyUI 変数上書き: ダークテーマ (night)
   ============================================ */
:root[data-theme="night"] {
  --p: 72% 0.165 57;
  --pf: 68% 0.165 49;
  --pc: 100% 0 0;
  --s: 78% 0.15 75;
  --sc: 19% 0 0;
  --a: 64% 0.2 38;
  --ac: 100% 0 0;
  --n: 51% 0 0;
  --nc: 95% 0 0;
  --b1: 19% 0 0;
  --b2: 15% 0 0;
  --b3: 12% 0 0;
  --bc: 95% 0 0;
  --in: 55.5% 0.2 265;
  --inc: 100% 0 0;
  --su: 62% 0.17 150;
  --suc: 100% 0 0;
  --wa: 77% 0.15 75;
  --wac: 19% 0 0;
  --er: 60% 0.255 26;
  --erc: 100% 0 0;
  --rounded-box: 0.375rem;
  --rounded-btn: 0.375rem;
  --rounded-badge: 0.25rem;
}

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
