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
  --radius-sm: 0.375rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;

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

/* テーマ別カスタム変数定義 */
[data-theme="night"] {
  --glass-bg: rgba(15, 23, 42, 0.65);
  --glass-border: rgba(255, 255, 255, 0.08);
  --glass-glow: rgba(124, 58, 237, 0.15);
  --gradient-accent: linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%);
  --sidebar-active-bg: rgba(124, 58, 237, 0.15);
  --sidebar-active-border: #7c3aed;
  --card-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  --input-focus-border: rgba(124, 58, 237, 0.5);
  --input-focus-shadow: 0 0 0 3px rgba(124, 58, 237, 0.25);
  
  /* プレミアム感のある背景調整 */
  background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0f172a 70%, #020617 100%);
  background-attachment: fixed;
}

[data-theme="winter"] {
  --glass-bg: rgba(255, 255, 255, 0.65);
  --glass-border: rgba(15, 23, 42, 0.08);
  --glass-glow: rgba(14, 165, 233, 0.15);
  --gradient-accent: linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%);
  --sidebar-active-bg: rgba(14, 165, 233, 0.1);
  --sidebar-active-border: #0ea5e9;
  --card-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
  --input-focus-border: rgba(14, 165, 233, 0.5);
  --input-focus-shadow: 0 0 0 3px rgba(14, 165, 233, 0.2);
  
  /* 爽やかな背景調整 */
  background: radial-gradient(circle at 50% 0%, #f0f9ff 0%, #e0f2fe 50%, #f1f5f9 100%);
  background-attachment: fixed;
}
`;
