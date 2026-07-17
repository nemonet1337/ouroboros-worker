import type { FC } from "hono/jsx";
import type { PublicConfig } from "../../http/data";

// ─── 一般ユーザーの新規登録制御 ────────────────────────────────────────────────

interface RegistrationToggleProps {
  enabled: boolean;
  firstUser: boolean;
  /** 環境変数 OURO_REGISTRATION_ENABLED による上書きが有効な場合は切替不可 */
  envOverride: boolean;
}

export const RegistrationToggle: FC<RegistrationToggleProps> = ({ enabled, firstUser, envOverride }) => {
  return (
    <div id="registration-control" class="space-y-3">
      <div class="form-control bg-base-200/40 border border-[var(--glass-border)] p-4 rounded-xl">
        <label class="label cursor-pointer flex items-center justify-between py-1">
          <div>
            <span class="label-text font-semibold">新規登録を受け付ける</span>
            <p class="text-xs opacity-50 mt-0.5">
              {enabled
                ? "現在、新しいユーザーがアカウントを作成できます。"
                : "現在、新規登録は停止しています（既存ユーザーのログインは可能）。"}
            </p>
          </div>
          <input
            type="checkbox"
            name="enabled"
            class="toggle toggle-primary"
            checked={enabled}
            disabled={envOverride}
            hx-post="/ui/fragments/admin/registration/toggle"
            hx-target="#registration-control"
            hx-swap="outerHTML"
          />
        </label>
      </div>
      {envOverride && (
        <p class="text-xs opacity-50 flex items-center gap-1">
          <i data-lucide="lock" class="w-3.5 h-3.5" />
          <span>環境変数 OURO_REGISTRATION_ENABLED により固定されているため、ここからは変更できません。</span>
        </p>
      )}
      {firstUser && (
        <div class="alert alert-info rounded-lg flex items-center gap-2 text-sm">
          <i data-lucide="info" class="w-5 h-5" />
          <span>アカウントが未作成です。次の登録ユーザーが管理者になります。</span>
        </div>
      )}
    </div>
  );
};

// ─── システムログ (R2 バケット) ────────────────────────────────────────────────

interface LogFileListProps {
  files: string[];
}

export const LogFileList: FC<LogFileListProps> = ({ files }) => {
  return (
    <div class="space-y-3">
      {files.length === 0 ? (
        <div class="card card-glass p-8 text-center text-base-content/50">
          <i data-lucide="file-text" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">ログファイルはありません</p>
          <p class="text-xs opacity-75 mt-1">システムが稼働するとログが R2 バケットに保存されます。</p>
        </div>
      ) : (
        <ul class="space-y-2">
          {files.map((file) => (
            <li key={file}>
              <button
                class="btn btn-sm btn-outline rounded-lg w-full justify-start gap-2 font-mono text-xs"
                hx-get={`/ui/fragments/admin/logs/${encodeURIComponent(file)}`}
                hx-target="#log-viewer"
                hx-swap="innerHTML"
                hx-disabled-elt="this"
              >
                <i data-lucide="file-text" class="w-3.5 h-3.5" />
                <span>{file}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div id="log-viewer" class="empty:hidden"></div>
    </div>
  );
};

/** ログファイル本文のビューア。hono/jsx の自動エスケープで XSS 安全に表示する。 */
export const LogFileViewer: FC<{ file: string; content: string }> = ({ file, content }) => {
  return (
    <div class="space-y-2">
      <div class="text-xs opacity-60 font-mono">{file}</div>
      <pre class="text-xs font-mono leading-relaxed bg-base-200 border border-[var(--glass-border)] rounded-xl p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
        {content || "（ログは空です）"}
      </pre>
    </div>
  );
};

// ─── システム環境設定 (読み取り専用) ──────────────────────────────────────────

interface ConfigViewProps {
  config: PublicConfig;
}

export const ConfigView: FC<ConfigViewProps> = ({ config }) => {
  const languages = Array.isArray(config.selectedLanguages) ? (config.selectedLanguages as string[]) : [];

  return (
    <dl class="space-y-4 text-sm">
      <div>
        <dt class="text-xs font-semibold uppercase tracking-wider opacity-50">対象言語</dt>
        <dd class="mt-1.5 flex gap-1.5 flex-wrap">
          {languages.length > 0 ? (
            languages.map((lang) => (
              <span
                key={lang}
                class="badge badge-sm rounded-full font-bold bg-primary/10 text-primary border border-primary/20"
              >
                {lang}
              </span>
            ))
          ) : (
            <span class="opacity-50">未設定</span>
          )}
        </dd>
      </div>

      <div>
        <dt class="text-xs font-semibold uppercase tracking-wider opacity-50">連携リポジトリ</dt>
        <dd class="mt-1.5">
          {config.gitRepository ? (
            <span class="font-mono text-xs px-2 py-1 rounded bg-base-200 border border-[var(--glass-border)]/50">
              {config.gitRepository}
            </span>
          ) : (
            <span class="opacity-50">未設定</span>
          )}
        </dd>
      </div>

      <div>
        <dt class="text-xs font-semibold uppercase tracking-wider opacity-50">GitHub トークン</dt>
        <dd class="mt-1.5">
          {config.gitTokenSet ? (
            <span class="badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 gap-1">
              <i data-lucide="check" class="w-3 h-3" />
              設定済み (CF Secret)
            </span>
          ) : (
            <span class="badge badge-sm rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 gap-1">
              <i data-lucide="x" class="w-3 h-3" />
              未設定
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
};
