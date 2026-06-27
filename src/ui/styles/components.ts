export const components = `
/* アラートの最小保証色（Cloudflareステータス色） */
.alert-error {
  background-color: #FF4040;
  color: #ffffff;
  border-color: #E03030;
}
.alert-success {
  background-color: #16A34A;
  color: #ffffff;
  border-color: #128A3E;
}
.alert-warning {
  background-color: #FAAE40;
  color: #1D1D1D;
  border-color: #E8992A;
}
.alert-info {
  background-color: #1F6FEB;
  color: #ffffff;
  border-color: #1A5EC8;
}

/* フラットカード */
.card-glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  box-shadow: var(--card-shadow);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-normal), box-shadow var(--transition-normal);
}

.card-glass:hover {
  border-color: rgba(246, 130, 31, 0.3);
}

/* ソリッドオレンジボタン */
.btn-gradient {
  background: #F6821F;
  color: #ffffff !important;
  border: none;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}

.btn-gradient:hover {
  background: #E5731A;
  box-shadow: 0 1px 2px rgba(246, 130, 31, 0.3);
}

.btn-gradient:active {
  transform: scale(0.98);
}

/* フラット入力フィールド */
.input-glow {
  background: var(--glass-bg) !important;
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
  border-left: 3px solid var(--sidebar-active-border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0 !important;
  font-weight: 600;
}

/* モダンテーブル */
.table-modern {
  width: 100%;
  border-collapse: collapse;
}

.table-modern tbody tr {
  border-bottom: 1px solid var(--glass-border);
}

.table-modern tbody tr:hover {
  background: var(--glass-border);
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

/* ステータスバッジパルス（オレンジ） */
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
  background: #F6821F;
  animation: pulseGlow 1.5s infinite;
}

/* スクロールバー（Cloudflare風・細く） */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
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

/* ブランドパネル（常にダーク・Cloudflare marketing風） */
.brand-panel {
  background: linear-gradient(135deg, #0C0D11 0%, #1D1D1D 100%) !important;
  color: #F3F3F3 !important;
  transition: background var(--transition-normal), color var(--transition-normal);
}

.brand-title {
  font-weight: 900;
  letter-spacing: 0.05em;
  background-clip: text;
  -webkit-background-clip: text;
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

[data-theme="night"] .brand-title {
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

[data-theme="winter"] .brand-title {
  background-image: var(--gradient-accent) !important;
  -webkit-text-fill-color: transparent;
}

.brand-text {
  color: #94A3B8 !important;
  transition: color var(--transition-normal);
}

.brand-icon-box {
  background: rgba(246, 130, 31, 0.1);
  border: 1px solid rgba(246, 130, 31, 0.2);
  border-radius: var(--radius-md);
}

.brand-badge {
  background: rgba(246, 130, 31, 0.1);
  border: 1px solid rgba(246, 130, 31, 0.15);
  color: #F3F3F3;
  border-radius: var(--radius-md);
}
`;
