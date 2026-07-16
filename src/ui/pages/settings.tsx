import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { AiModelInfo } from "../../ports/ai";
import { Layout } from "../layout";
import { MODEL_MODES, MODEL_MODE_LABELS, type ModelMode } from "../../config/model.modes";

interface SettingsPageProps {
  user?: AuthedUser;
  models?: AiModelInfo[];
  globalModel?: string | null;
  modeModels?: Record<string, string>;
  defaultModel?: string;
  appSettings?: Record<string, unknown>;
  codeIndexStatus?: { status: string; files?: number; chunks?: number; updatedAt?: number; error?: string } | null;
  vectorizeCodeEnabled?: boolean;
}

const ModelSelect: FC<{
  name: string;
  label: string;
  hint: string;
  models: AiModelInfo[];
  selected: string | null | undefined;
}> = ({ name, label, hint, models, selected }) => (
  <div class="form-control">
    <label class="label py-1" for={`model-${name}`}>
      <span class="label-text font-semibold opacity-75">{label}</span>
    </label>
    <select
      name={name}
      id={`model-${name}`}
      class="select select-bordered w-full rounded-xl text-sm"
    >
      <option value="" selected={!selected}>
        {hint}
      </option>
      {models.map((m) => (
        <option value={m.value} selected={selected === m.value}>
          {m.label}
        </option>
      ))}
    </select>
  </div>
);

export const SettingsPage: FC<SettingsPageProps> = ({
  user,
  models = [],
  globalModel = null,
  modeModels = {},
  defaultModel = "",
  appSettings = {},
  codeIndexStatus = null,
  vectorizeCodeEnabled = false,
}) => {
  const weights = (appSettings.weights ?? {}) as Record<string, number>;
  const schedule = (appSettings.schedule ?? {}) as Record<string, string>;

  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          システム設定
        </h1>
        <p class="text-sm opacity-60 mt-1">
          個人プロファイルの更新、利用する AI モデルの構成、および高度なシステムの動作制御
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
                モードごとに個別のモデルを設定でき、未設定のモードはグローバル設定
                （未設定時は <code class="font-mono">{defaultModel}</code>）を使用します。
              </p>

              {models.length === 0 ? (
                <div class="alert alert-warning text-xs rounded-lg">
                  <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                  <span>利用可能なモデルの一覧を取得できませんでした。AI バインディングの設定を確認してください。</span>
                </div>
              ) : (
                <form
                  hx-put="/api/v1/settings/models"
                  hx-target="#model-save-result"
                  hx-swap="innerHTML"
                  hx-disabled-elt="button[type='submit']"
                  class="space-y-4"
                >
                  <ModelSelect
                    name="global"
                    label="グローバル（全モード共通のデフォルト）"
                    hint={`システムデフォルト（${defaultModel}）を使用`}
                    models={models}
                    selected={globalModel}
                  />

                  <div class="divider text-xs opacity-40 my-2">モード別設定</div>

                  {MODEL_MODES.map((mode: ModelMode) => (
                    <ModelSelect
                      name={mode}
                      label={MODEL_MODE_LABELS[mode]}
                      hint="グローバル設定に従う"
                      models={models}
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
              )}
              <div id="model-save-result" class="mt-4 empty:hidden"></div>
            </div>
          </div>

        </div>

        {/* 右側: 高度なシステム設定 (1カラム分) */}
        <div class="xl:col-span-1 space-y-6">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="sliders" class="w-5 h-5 text-accent" />
                <span>高度なシステム構成</span>
              </h2>
              <p class="text-xs opacity-60 mb-6">
                スコア重み付けや閾値、自動修復スケジュール等の現在の設定値（変更は API から）。
              </p>

              <div class="space-y-3 text-sm">
                <div>
                  <div class="font-semibold opacity-75 mb-1">スコア重み付け</div>
                  <ul class="text-xs opacity-70 space-y-0.5">
                    {Object.entries(weights).map(([k, v]) => (
                      <li class="flex justify-between">
                        <span>{k}</span>
                        <span class="font-mono">{String(v)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div class="font-semibold opacity-75 mb-1">スケジュール</div>
                  <div class="text-xs opacity-70 font-mono">
                    {schedule.cronExpr ?? "-"} ({schedule.cronTimezone ?? "-"})
                  </div>
                </div>
                <div class="flex justify-between text-xs opacity-70">
                  <span class="font-semibold opacity-100">新規登録の受付</span>
                  <span>{appSettings.registrationEnabled ? "有効" : "無効"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vectorize コードインデックスカード */}
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="database" class="w-5 h-5 text-info" />
                <span>コードインデックス（Vectorize）</span>
              </h2>
              <p class="text-xs opacity-60 mb-4">
                リポジトリのコードを埋め込みベクトル化し、自己修復解析時の追加コンテキストとして利用します。
                インデックスは非同期に構築されるため、完了まで数分かかることがあります。
              </p>

              {!vectorizeCodeEnabled ? (
                <div class="alert alert-warning text-xs rounded-lg">
                  <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                  <span>VECTORIZE_CODE バインディングが未設定のため利用できません。</span>
                </div>
              ) : (
                <div class="space-y-3">
                  <div class="text-xs opacity-70 space-y-0.5">
                    <div class="flex justify-between">
                      <span class="font-semibold">状態</span>
                      <span class="font-mono">{codeIndexStatus?.status ?? "未実行"}</span>
                    </div>
                    {codeIndexStatus?.files !== undefined && (
                      <div class="flex justify-between">
                        <span>ファイル数</span>
                        <span class="font-mono">{codeIndexStatus.files}</span>
                      </div>
                    )}
                    {codeIndexStatus?.chunks !== undefined && (
                      <div class="flex justify-between">
                        <span>チャンク数</span>
                        <span class="font-mono">{codeIndexStatus.chunks}</span>
                      </div>
                    )}
                    {codeIndexStatus?.error && (
                      <div class="text-error">{codeIndexStatus.error}</div>
                    )}
                  </div>
                  {user?.role === "admin" && (
                    <button
                      hx-post="/api/v1/code-index/reindex"
                      hx-target="#code-index-result"
                      hx-swap="innerHTML"
                      class="btn btn-sm btn-outline rounded-xl gap-2"
                    >
                      <i data-lucide="refresh-cw" class="w-4 h-4" />
                      <span>再インデックス</span>
                    </button>
                  )}
                  <div id="code-index-result" class="empty:hidden"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { SettingsPageProps };
