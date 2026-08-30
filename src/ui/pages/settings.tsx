import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";
import { FLAGS } from "../../flags/flag.service";

interface SettingsPageProps {
  user?: AuthedUser;
  appSettings?: Record<string, unknown>;
  webhooksEnabled?: boolean;
  featureFlags?: Record<string, boolean>;
}

// GUI で切り替え可能な機能トグル一覧
const FEATURE_TOGGLES: Array<{ flag: string; label: string }> = [
  { flag: FLAGS.CODE_NEEDS_FIX, label: "コード編集セッション（生成）" },
  { flag: FLAGS.CODE_FIX_COMPLETE, label: "コード編集（PR 適用）" },
  { flag: FLAGS.REFACTOR_APPROVED, label: "リファクタ提案（生成）" },
  { flag: FLAGS.REFACTOR_APPLIED, label: "リファクタ提案（適用）" },
];

export const SettingsPage: FC<SettingsPageProps> = ({
  user,
  appSettings = {},
  webhooksEnabled = true,
  featureFlags = {},
}) => {
  const isAdmin = user?.role === "admin";
  const schedule = (appSettings.schedule ?? {}) as Record<string, unknown>;
  // schedule.time は "HH:MM"（UTC）。未設定は cronExpr から推定できないので空。
  const scheduleTime = typeof schedule.time === "string" ? schedule.time : "";
  // schedule.daysOfWeek は UTC の曜日番号配列（0=日〜6=土）。空/未設定は毎日実行。
  const daysOfWeekRaw = Array.isArray(schedule.daysOfWeek) ? (schedule.daysOfWeek as unknown[]) : [];
  const daysOfWeek = new Set(daysOfWeekRaw.filter((d): d is number => typeof d === "number"));
  const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          システム設定
        </h1>
        <p class="text-sm opacity-60 mt-1">
          個人プロファイルの更新、およびシステム全体の動作制御
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: プロファイル */}
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

          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="cpu" class="w-5 h-5 text-secondary" />
                <span>AI モデル</span>
              </h2>
              <p class="text-xs opacity-60 mb-4">
                テキスト生成と Embedding のモデル選択は専用画面に移しました。
              </p>
              <a href="/models" class="btn btn-outline rounded-xl gap-2">
                <i data-lucide="arrow-right" class="w-4 h-4" />
                <span>モデル設定を開く</span>
              </a>
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

                  <div class="form-control">
                    <label class="label py-1">
                      <span class="label-text font-semibold opacity-75">実行曜日 (UTC)</span>
                    </label>
                    <div class="flex flex-wrap gap-2">
                      {DAY_LABELS.map((label, idx) => (
                        <label class="label cursor-pointer gap-1 px-1">
                          <input
                            type="checkbox"
                            name="scheduleDays"
                            value={idx}
                            class="checkbox checkbox-sm checkbox-primary"
                            checked={daysOfWeek.has(idx)}
                          />
                          <span class="label-text text-sm opacity-75">{label}</span>
                        </label>
                      ))}
                    </div>
                    <label class="label px-1">
                      <span class="label-text-alt opacity-50">
                        未選択（全て未チェック）の場合は毎日実行します。
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
