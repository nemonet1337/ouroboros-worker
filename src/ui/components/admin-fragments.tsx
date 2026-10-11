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

// ─── システム構成 (読み取り専用) ───────────────────────────────────────────────

/** 設定有無バッジ。値そのものは絶対に表示しない。 */
const KeyStatusBadge: FC<{ ok: boolean; okLabel?: string }> = ({ ok, okLabel = "設定済み" }) =>
  ok ? (
    <span class="badge badge-sm rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 gap-1">
      <i data-lucide="check" class="w-3 h-3" />
      {okLabel}
    </span>
  ) : (
    <span class="badge badge-sm rounded-full font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 gap-1">
      <i data-lucide="x" class="w-3 h-3" />
      未設定
    </span>
  );

const AI_KEY_ROWS: Array<{ key: keyof PublicConfig["aiKeys"]; label: string }> = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "xai", label: "xAI" },
  { key: "openrouter", label: "OpenRouter" },
  { key: "laya", label: "Laya（ローカル判定・任意）" },
];

interface ConfigViewProps {
  config: {
    gitRepository?: string | null;
    gitTokenSet?: boolean;
    aiKeys?: PublicConfig["aiKeys"];
  };
}

export const ConfigView: FC<ConfigViewProps> = ({ config }) => {
  return (
    <dl class="space-y-4 text-sm">
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
          <KeyStatusBadge ok={!!config.gitTokenSet} okLabel="設定済み (CF Secret)" />
        </dd>
      </div>

      <div>
        <dt class="text-xs font-semibold uppercase tracking-wider opacity-50">AI プロバイダーキー</dt>
        <dd class="mt-1.5 space-y-2">
          {AI_KEY_ROWS.map((row) => (
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs opacity-75">{row.label}</span>
              <KeyStatusBadge ok={config.aiKeys?.[row.key] === true} />
            </div>
          ))}
          <p class="text-[11px] opacity-45 pt-1">
            値は表示されません。Node は <code class="font-mono">.env</code>、Cloudflare は{" "}
            <code class="font-mono">wrangler secret put</code> で設定します。
          </p>
        </dd>
      </div>
    </dl>
  );
};
