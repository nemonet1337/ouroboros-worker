import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { AiModelInfo } from "../../ports/ai";
import {
  DEFAULT_WORKERS_AI_MODEL,
  isDecisionModel,
  isEmbeddingTask,
  isTextGenerationTask,
} from "../../config/deployment";
import { DEFAULT_ROUTING_CONFIG, type RoutingConfig } from "../../config/routing";
import { Layout } from "../layout";
import { ModelPricingPanel } from "../components/model-pricing";

interface ModelsPageProps {
  user?: AuthedUser;
  models?: AiModelInfo[];
  /** このユーザーの個人上書きモデル。Clef の判定を無視して使う。 */
  selectedModel?: string | null;
  defaultModel?: string;
  routing?: RoutingConfig;
}

/** Clef は生成モデルではないため、候補から除外する。 */
function splitModels(models: AiModelInfo[]): { text: AiModelInfo[]; embedding: AiModelInfo[] } {
  const text: AiModelInfo[] = [];
  const embedding: AiModelInfo[] = [];
  for (const m of models) {
    if (isDecisionModel(m.value)) continue;
    if (isEmbeddingTask(m.task)) {
      embedding.push(m);
    } else if (isTextGenerationTask(m.task)) {
      text.push(m);
    }
  }
  return { text, embedding };
}

const EFFORT_OPTIONS = ["none", "low", "medium", "high"] as const;

interface RoleCard {
  key: "efficiency" | "performance" | "embed";
  title: string;
  icon: string;
  accent: string;
  /** モデル ID の input name（RoutingConfig のキー名）。 */
  modelName: "efficiencyModel" | "performanceModel" | "embedModel";
  /** effort の select name。Embed には無い。 */
  effortName?: "efficiencyEffort" | "performanceEffort";
  description: string;
  listId: string;
  effort: boolean;
}

/** 3 つの役割（Efficiency / Performance / Embed）それぞれのモデル選択。 */
const ROLES: RoleCard[] = [
  {
    key: "efficiency",
    title: "Efficiency（効率系）",
    icon: "zap",
    accent: "text-secondary",
    modelName: "efficiencyModel",
    effortName: "efficiencyEffort",
    description:
      "Clef が容易と判断したタスク、および inspection / healing / refactor の既定モデル。短い出力で足りるものを選びます。",
    listId: "efficiency-models",
    effort: true,
  },
  {
    key: "performance",
    title: "Performance（性能系）",
    icon: "rocket",
    accent: "text-primary",
    modelName: "performanceModel",
    effortName: "performanceEffort",
    description:
      "Clef が実装難易度を閾値以上と判定したときのコード生成に使います。長い推論と大量出力が必要なモデルを選びます。",
    listId: "performance-models",
    effort: true,
  },
  {
    key: "embed",
    title: "Embed（埋め込み）",
    icon: "waypoints",
    accent: "text-accent",
    modelName: "embedModel",
    description:
      "コード検索で使う埋め込みモデル。インデックスは持たないため、リクエストごとに chunk 化して埋め込みます。",
    listId: "embed-models",
    effort: false,
  },
];

export const ModelsPage: FC<ModelsPageProps> = ({
  user,
  models = [],
  selectedModel = null,
  defaultModel = DEFAULT_WORKERS_AI_MODEL,
  routing = DEFAULT_ROUTING_CONFIG,
}) => {
  const isAdmin = user?.role === "admin";
  const { text, embedding } = splitModels(models);
  const preview =
    models.find((m) => m.value === (selectedModel || routing.efficiencyModel)) ??
    models.find((m) => m.value === routing.embedModel) ??
    null;

  const valueOf = (role: RoleCard) =>
    role.key === "efficiency"
      ? routing.efficiencyModel
      : role.key === "performance"
        ? routing.performanceModel
        : routing.embedModel;
  const effortOf = (role: RoleCard) =>
    role.key === "performance" ? routing.performanceEffort : routing.efficiencyEffort;
  const candidatesOf = (role: RoleCard) => (role.key === "embed" ? embedding : text);

  return (
    <Layout user={user}>
      <datalist id="text-gen-models">
        {text.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>
      <datalist id="efficiency-models">
        {text.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>
      <datalist id="performance-models">
        {text.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>
      <datalist id="embed-models">
        {embedding.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>

      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">モデル設定</h1>
        <p class="text-sm opacity-60 mt-1">
          用途ごとに 3 つのモデルを選びます。すべての設定はシステム全体で共有されます。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div class="xl:col-span-2 space-y-6">
          <form
            hx-put="/api/v1/settings/routing"
            hx-target="#routing-save-result"
            hx-swap="innerHTML"
            hx-disabled-elt="button[type='submit']"
            hx-ext="json-enc"
            class="card card-glass shadow-lg"
          >
            <div class="card-body p-6 md:p-8 space-y-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2">
                <i data-lucide="git-branch" class="w-5 h-5 text-primary" />
                <span>用途別モデル</span>
              </h2>

              {ROLES.map((role) => (
                <div class="border border-base-content/10 rounded-xl p-4 space-y-3">
                  <h3 class="font-semibold text-sm flex items-center gap-2">
                    <i data-lucide={role.icon} class={`w-4 h-4 ${role.accent}`} />
                    <span>{role.title}</span>
                  </h3>
                  <p class="text-xs opacity-60">{role.description}</p>
                  <div
                    class={
                      role.effort
                        ? "grid grid-cols-1 md:grid-cols-3 gap-3"
                        : "grid grid-cols-1 gap-3"
                    }
                  >
                    <div class="form-control md:col-span-2">
                      <label class="label py-1" for={role.modelName}>
                        <span class="label-text text-xs font-semibold opacity-75">モデル ID</span>
                      </label>
                      <input
                        type="text"
                        name={role.modelName}
                        id={role.modelName}
                        list={role.listId}
                        value={valueOf(role)}
                        disabled={!isAdmin}
                        class="input w-full rounded-xl text-sm font-mono"
                        hx-get="/ui/fragments/model-pricing"
                        hx-trigger="change, keyup delay:400ms changed"
                        hx-target="#model-pricing"
                        hx-swap="innerHTML"
                        hx-include="this"
                      />
                    </div>
                    {role.effort && (
                      <div class="form-control">
                        <label class="label py-1" for={`${role.modelName}-effort`}>
                          <span class="label-text text-xs font-semibold opacity-75">effort</span>
                        </label>
                        <select
                          name={role.effortName}
                          id={`${role.modelName}-effort`}
                          disabled={!isAdmin}
                          class="select w-full rounded-xl text-sm font-mono"
                        >
                          {EFFORT_OPTIONS.map((v) => (
                            <option value={v} selected={effortOf(role) === v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <p class="text-[11px] opacity-45">
                    候補 {candidatesOf(role).length} 件
                    {candidatesOf(role).length === 0 && "（カタログ取得失敗時は直接入力可）"}
                  </p>
                </div>
              ))}

              <div class="border border-base-content/10 rounded-xl p-4 space-y-3">
                <h3 class="font-semibold text-sm flex items-center gap-2">
                  <i data-lucide="gauge" class="w-4 h-4 text-secondary" />
                  <span>モデル階層ルーティング</span>
                </h3>
                <p class="text-xs opacity-60">
                  コード生成前に
                  <code class="font-mono">{routing.clefModel}</code>{" "}
                  が実装難易度を 1〜5 で判定し、閾値以上で Performance を使います。
                </p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="form-control">
                    <label class="label py-1" for="solThreshold">
                      <span class="label-text text-xs font-semibold opacity-75">
                        Performance に上げる難易度（1〜5）
                      </span>
                    </label>
                    <input
                      type="number"
                      name="solThreshold"
                      id="solThreshold"
                      min="1"
                      max="5"
                      value={routing.solThreshold}
                      disabled={!isAdmin}
                      class="input w-full rounded-xl text-sm font-mono"
                    />
                  </div>
                  <div class="form-control">
                    <label class="label py-1" for="clefModel">
                      <span class="label-text text-xs font-semibold opacity-75">判定モデル</span>
                    </label>
                    <input
                      type="text"
                      name="clefModel"
                      id="clefModel"
                      value={routing.clefModel}
                      disabled={!isAdmin}
                      class="input w-full rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              {!isAdmin && (
                <label class="label px-1">
                  <span class="label-text-alt opacity-50">変更は管理者のみ可能です。</span>
                </label>
              )}

              <div class="flex flex-wrap gap-3">
                <button
                  type="submit"
                  class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center"
                  disabled={!isAdmin}
                >
                  <i data-lucide="save" class="w-4 h-4" />
                  <span>モデル設定を保存</span>
                </button>
              </div>
              <div id="routing-save-result" class="empty:hidden"></div>
            </div>
          </form>

          <form
            hx-put="/api/v1/settings/models"
            hx-target="#model-save-result"
            hx-swap="innerHTML"
            hx-disabled-elt="button[type='submit']"
            class="card card-glass shadow-lg"
          >
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="user-cog" class="w-5 h-5 text-secondary" />
                <span>個人上書き（任意）</span>
              </h2>
              <p class="text-xs opacity-60 mb-4">
                モデルを指定すると、コード生成で Clef の判定を無視してそのモデルを使います。
                空欄なら Clef が選びます。inspection / healing / refactor には影響しません。
              </p>
              <div class="form-control">
                <input
                  type="text"
                  name="model"
                  id="model"
                  list="text-gen-models"
                  value={selectedModel ?? ""}
                  placeholder={`Clef で判定（既定: ${defaultModel}）`}
                  class="input w-full rounded-xl text-sm font-mono"
                  hx-get="/ui/fragments/model-pricing"
                  hx-trigger="change, keyup delay:400ms changed"
                  hx-target="#model-pricing"
                  hx-swap="innerHTML"
                  hx-include="this"
                />
              </div>
              <div class="mt-4">
                <button
                  type="submit"
                  class="btn btn-outline rounded-xl py-3 h-auto gap-2"
                >
                  <i data-lucide="save" class="w-4 h-4" />
                  <span>個人設定を保存</span>
                </button>
              </div>
              <div id="model-save-result" class="empty:hidden"></div>
            </div>
          </form>
        </div>

        <div class="xl:col-span-1 xl:sticky xl:top-20">
          <div id="model-pricing">
            <ModelPricingPanel model={preview} query={selectedModel || routing.efficiencyModel} />
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { ModelsPageProps };