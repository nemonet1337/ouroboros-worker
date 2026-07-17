import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { AiModelInfo } from "../../ports/ai";
import { Layout } from "../layout";
import { MODEL_MODES, MODEL_MODE_LABELS, type ModelMode } from "../../config/model.modes";
import { FLAGS } from "../../flags/flag.service";

interface SettingsPageProps {
  user?: AuthedUser;
  models?: AiModelInfo[];
  globalModel?: string | null;
  modeModels?: Record<string, string>;
  defaultModel?: string;
  appSettings?: Record<string, unknown>;
  webhooksEnabled?: boolean;
  featureFlags?: Record<string, boolean>;
}

/** データリストの共有 ID。全モデル入力欄で共有する。 */
const MODEL_DATALIST_ID = "ai-models";

/**
 * モデル入力欄。<input list> + 共有 <datalist> でネイティブ検索でき、任意の
 * モデル ID も直接入力できる。保存値は input の value なのでリストに無くても
 * 表示が保たれる（「元に戻る」が根治）。
 */
const ModelInput: FC<{
  name: string;
  label: string;
  hint: string;
  selected: string | null | undefined;
}> = ({ name, label, hint, selected }) => (
  <div class="form-control">
    <label class="label py-1" for={`model-${name}`}>
      <span class="label-text font-semibold opacity-75">{label}</span>
    </label>
    <input
      type="text"
      name={name}
      id={`model-${name}`}
      list={MODEL_DATALIST_ID}
      value={selected ?? ""}
      placeholder={hint}
      class="input input-bordered w-full rounded-xl text-sm font-mono"
    />
  </div>
);

// GUI で切り替え可能な機能トグル一覧
const FEATURE_TOGGLES: Array<{ flag: string; label: string }> = [
  { flag: FLAGS.CODE_NEEDS_FIX, label: "コード編集セッション（生成）" },
  { flag: FLAGS.CODE_FIX_COMPLETE, label: "コード編集（PR 適用）" },
  { flag: FLAGS.REFACTOR_APPROVED, label: "リファクタ提案（生成）" },
  { flag: FLAGS.REFACTOR_APPLIED, label: "リファクタ提案（適用）" },
];

export const SettingsPage: FC<SettingsPageProps> = ({
  user,
  models = [],
  globalModel = null,
  modeModels = {},
  defaultModel = "",
  appSettings = {},
  webhooksEnabled = true,
  featureFlags = {},
}) => {
  const isAdmin = user?.role === "admin";
  const schedule = (appSettings.schedule ?? {}) as Record<string, string>;
  // schedule.time は "HH:MM"（UTC）。未設定は cronExpr から推定できないので空。
  const scheduleTime = typeof schedule.time === "string" ? schedule.time : "";

  return (
    <Layout user={user}>
      {/* 共有データリスト（Text Generation モデル） */}
      <datalist id={MODEL_DATALIST_ID}>
        {models.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>

      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          システム設定
        </h1>
        <p class="text-sm opacity-60 mt-1">
          個人プロファイルの更新、利用する AI モデルの構成、およびシステム全体の動作制御
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: プロファイル & AIモデル (2カラム分) */}
        <div class="xl:col-span-2 space-y-6">

          {/* プロファイル設定カード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="user" class="w-5 h-5 text-primary" />
                <span>プロファイル設定</span>
              </h2>

              <form
                hx-put="/ui/fragments/profile"
                hx-target="#profile-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                class="space-y-4"
              >
                <div class="form-control">
                  <label class="label py-1" for="email">
                    <span class="label-text font-semibold opacity-75">メールアドレス</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    id="email"
                    placeholder={user?.email || "you@example.com"}
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    required
                  />
                </div>

                <div class="form-control">
                  <label class="label py-1" for="password">
                    <span class="label-text font-semibold opacity-75">新しいパスワード</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    id="password"
                    placeholder="変更しない場合は空欄のままにしてください"
                    class="input input-bordered w-full input-glow rounded-xl mt-1 text-sm"
                    minlength={8}
                  />
                  <label class="label px-1">
                    <span class="label-text-alt opacity-50">変更する場合のみ、8文字以上で入力します。</span>
                  </label>
                </div>

                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="save" class="w-4 h-4" />
                    <span>プロフィールを保存</span>
                  </button>
                </div>
              </form>
              <div id="profile-result" class="mt-4 empty:hidden"></div>
            </div>
          </div>

          {/* AIモデル設定カード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="cpu" class="w-5 h-5 text-secondary" />
                <span>AI 推論モデル設定</span>
              </h2>
              <p class="text-xs opacity-60 mb-6">
                自己修復やスキャン時に利用される Cloudflare Workers AI モデルを指定します。
                リストから検索するか、任意のモデル ID を直接入力できます。未設定のモードは
                グローバル設定（未設定時は <code class="font-mono">{defaultModel}</code>）を使用します。
              </p>

              {models.length === 0 && (
                <div class="alert alert-warning text-xs rounded-lg mb-4">
                  <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                  <span>利用可能なモデル一覧を取得できませんでした。モデル ID を直接入力して保存できます。</span>
                </div>
              )}

              <form
                hx-put="/api/v1/settings/models"
                hx-target="#model-save-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                class="space-y-4"
              >
                <ModelInput
                  name="global"
                  label="グローバル（全モード共通のデフォルト）"
                  hint={`システムデフォルト（${defaultModel}）を使用`}
                  selected={globalModel}
                />

                <div class="divider text-xs opacity-40 my-2">モード別設定</div>

                {MODEL_MODES.map((mode: ModelMode) => (
                  <ModelInput
                    name={mode}
                    label={MODEL_MODE_LABELS[mode]}
                    hint="グローバル設定に従う"
                    selected={modeModels[mode] ?? null}
                  />
                ))}

                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="save" class="w-4 h-4" />
                    <span>モデル設定を保存</span>
                  </button>
                </div>
              </form>
              <div id="model-save-result" class="mt-4 empty:hidden"></div>
            </div>
          </div>

        </div>

        {/* 右側: システム設定 (1カラム分・管理者のみ) */}
        <div class="xl:col-span-1 space-y-6">
          {isAdmin ? (
            <div class="card card-glass shadow-lg">
              <div class="card-body p-6">
                <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                  <i data-lucide="sliders" class="w-5 h-5 text-accent" />
                  <span>システム設定</span>
                </h2>
                <p class="text-xs opacity-60 mb-4">
                  Webhook 配信・機能トグル・自己修復スケジュールを管理します（管理者のみ）。
                </p>

                <form
                  hx-put="/ui/fragments/system-settings"
                  hx-target="#system-settings-result"
                  hx-swap="innerHTML"
                  hx-disabled-elt="button[type='submit']"
                  class="space-y-5"
                >
                  {/* Webhook 全体 ON/OFF */}
                  <div class="form-control">
                    <label class="label cursor-pointer justify-start gap-3 py-1">
                      <input
                        type="checkbox"
                        name="webhooksEnabled"
                        class="toggle toggle-primary toggle-sm"
                        checked={webhooksEnabled}
                      />
                      <span class="label-text font-semibold opacity-75">Webhook 配信を有効にする</span>
                    </label>
                  </div>

                  <div class="divider text-xs opacity-40 my-1">機能トグル</div>

                  {FEATURE_TOGGLES.map((t) => (
                    <div class="form-control">
                      <label class="label cursor-pointer justify-start gap-3 py-1">
                        <input
                          type="checkbox"
                          name={`flag:${t.flag}`}
                          class="toggle toggle-sm"
                          checked={featureFlags[t.flag] !== false}
                        />
                        <span class="label-text text-sm opacity-75">{t.label}</span>
                      </label>
                    </div>
                  ))}

                  <div class="divider text-xs opacity-40 my-1">自己修復スケジュール</div>

                  <div class="form-control">
                    <label class="label py-1" for="scheduleTime">
                      <span class="label-text font-semibold opacity-75">実行時刻 (UTC)</span>
                    </label>
                    <input
                      type="time"
                      name="scheduleTime"
                      id="scheduleTime"
                      value={scheduleTime}
                      class="input input-bordered w-full rounded-xl text-sm"
                    />
                    <label class="label px-1">
                      <span class="label-text-alt opacity-50">
                        毎時 cron が UTC の HH:00 と照合し、一致時に自己修復を実行します。空欄で無効。
                      </span>
                    </label>
                  </div>

                  <div class="form-control pt-2">
                    <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                      <i data-lucide="save" class="w-4 h-4" />
                      <span>システム設定を保存</span>
                    </button>
                  </div>
                </form>
                <div id="system-settings-result" class="mt-4 empty:hidden"></div>
              </div>
            </div>
          ) : (
            <div class="card card-glass shadow-lg">
              <div class="card-body p-6">
                <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                  <i data-lucide="info" class="w-5 h-5 text-info" />
                  <span>システム設定</span>
                </h2>
                <p class="text-xs opacity-60">
                  Webhook 配信・機能トグル・スケジュールの変更は管理者のみ可能です。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};
export { SettingsPageProps };
