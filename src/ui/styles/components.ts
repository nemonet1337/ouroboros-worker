export const components = `
/* グラスモーフィズムカード */
.card-glass {
  background: var(--glass-bg);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius-md);
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
}

.card-glass:hover {
  border-color: var(--sidebar-active-border);
  box-shadow: 0 12px 40px 0 var(--glass-glow);
}

/* プレミアムグラデーションボタン */
.btn-gradient {
  background: var(--gradient-accent);
  color: #ffffff !important;
  border: none;
  font-weight: 600;
  transition: transform var(--transition-fast), filter var(--transition-fast), box-shadow var(--transition-fast);
}

.btn-gradient:hover {
  filter: brightness(1.1);
  box-shadow: 0 0 15px var(--sidebar-active-border);
  transform: translateY(-1px);
}

.btn-gradient:active {
  transform: translateY(1px);
}

/* インプットグロー */
.input-glow {
  background: rgba(0, 0, 0, 0.1) !important;
  border: 1px solid var(--glass-border);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.input-glow:focus {
  border-color: var(--input-focus-border) !important;
  box-shadow: var(--input-focus-shadow) !important;
  outline: none;
}

/* サイドバーアクティブリンク */
.nav-link-active {
  background: var(--sidebar-active-bg) !important;
  color: var(--sidebar-active-border) !important;
  border-left: 4px solid var(--sidebar-active-border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0 !important;
  font-weight: 600;
  box-shadow: inset 5px 0 10px rgba(0, 0, 0, 0.05);
}

/* モダンテーブル */
.table-modern {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 var(--spacing-sm);
}

.table-modern tr {
  transition: transform var(--transition-fast);
}

.table-modern tbody tr {
  background: rgba(255, 255, 255, 0.02);
}

[data-theme="winter"] .table-modern tbody tr {
  background: rgba(0, 0, 0, 0.01);
}

.table-modern tbody tr:hover {
  transform: scale(1.005);
  background: rgba(255, 255, 255, 0.04);
}

[data-theme="winter"] .table-modern tbody tr:hover {
  background: rgba(0, 0, 0, 0.02);
}

.table-modern td, .table-modern th {
  padding: var(--spacing-md);
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
}

.table-modern td:first-child, .table-modern th:first-child {
  border-left: 1px solid var(--glass-border);
  border-top-left-radius: var(--radius-sm);
  border-bottom-left-radius: var(--radius-sm);
}

.table-modern td:last-child, .table-modern th:last-child {
  border-right: 1px solid var(--glass-border);
  border-top-right-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
}

/* ステータスバッジのパルス効果 */
.badge-pulse {
  position: relative;
}

.badge-pulse::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  right: -2px;
  top: -2px;
  background: currentColor;
  animation: pulseGlow 1.5s infinite;
}

/* スクロールバーのカスタマイズ */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--glass-border);
  border-radius: var(--radius-sm);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--sidebar-active-border);
}
`;
