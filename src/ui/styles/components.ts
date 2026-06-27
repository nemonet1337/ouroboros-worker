export const components = `
/* アラートの最小保証色（DaisyUI変数が解決しなくても読めるようにする） */
.alert-error {
  background-color: #dc2626;
  color: #ffffff;
  border-color: #b91c1c;
}
.alert-success {
  background-color: #059669;
  color: #ffffff;
  border-color: #047857;
}
.alert-warning {
  background-color: #d97706;
  color: #ffffff;
  border-color: #b45309;
}
.alert-info {
  background-color: #0284c7;
  color: #ffffff;
  border-color: #0369a1;
}


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

/* ブランドパネルのテーマ別定義（視認性の確保） */
.brand-panel {
  transition: background var(--transition-normal), color var(--transition-normal);
}

[data-theme="night"] .brand-panel {
  background: linear-gradient(135deg, #090d16 0%, #111424 50%, #030408 100%) !important;
  color: #f8fafc !important;
}

[data-theme="winter"] .brand-panel {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%) !important;
  color: #0f172a !important;
}

.brand-title {
  font-weight: 900;
  letter-spacing: 0.05em;
  background-clip: text;
  -webkit-background-clip: text;
}

[data-theme="night"] .brand-title {
  background-image: linear-gradient(to right, #ffffff 0%, #cbd5e1 100%) !important;
  -webkit-text-fill-color: transparent;
}

[data-theme="winter"] .brand-title {
  background-image: linear-gradient(to right, #0f172a 0%, #1e293b 100%) !important;
  -webkit-text-fill-color: transparent;
}

.brand-text {
  transition: color var(--transition-normal);
}

[data-theme="night"] .brand-text {
  color: #94a3b8 !important;
}

[data-theme="winter"] .brand-text {
  color: #334155 !important;
}

.brand-icon-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
}

[data-theme="winter"] .brand-icon-box {
  background: rgba(0, 0, 0, 0.03);
}

.brand-badge {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border);
  color: inherit;
}

[data-theme="winter"] .brand-badge {
  background: rgba(0, 0, 0, 0.04);
}
`;

