import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { AiModelInfo } from "../../ports/ai";
import {
  DEFAULT_EMBEDDING_MODEL,
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
    models.find((m) => m.value === DEFAULT_EMBEDDING_MODEL) ??
    null;

  return (
    <Layout user={user}>
      <datalist id="text-gen-models">
        {text.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>

      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">モデル設定</h1>
        <p class="text-sm opacity-60 mt-1">
          テキスト生成モデルと、コード生成時のモデル階層（Clef 判定）を設定します。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div class="xl:col-span-2 space-y-6">
          <form
            hx-put="/api/v1/settings/models"
            hx-target="#model-save-result"
            hx-swap="innerHTML"
            hx-disabled-elt="button[type='submit']"
            class="space-y-6"
          >
            <div class="card card-glass shadow-lg">
              <div class="card-body p-6 md:p-8">
                <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                  <i data-lucide="cpu" class="w-5 h-5 text-secondary" />
                  <span>テキスト生成モデル（ユーザーごと）</span>
                </h2>
                <p class="text-xs opacity-60 mb-4">
                  inspection / healing / refactor と、コード生成でClef が Efficiency と判定したときの既定モデルです。空欄は
                  <code class="font-mono"> {defaultModel}</code>。明示すると Clef の判定を無視してこのモデルを使います。
                </p>
                {text.length === 0 && (
                  <div class="alert alert-warning text-xs rounded-lg mb-4">
                    <i data-lucide="alert-triangle" class="w-4 h-4" />
                    <span>一覧を取得できませんでした。モデル ID を直接入力できます。</span>
                  </div>
                )}
                <div class="form-control">
                  <label class="label py-1" for="model">
                    <span class="label-text font-semibold opacity-75">モデル ID</span>
                  </label>
                  <input
                    type="text"
                    name="model"
                    id="model"
                    list="text-gen-models"
                    value={selectedModel ?? ""}
                    placeholder={`Clef で判定（未設定なら ${routing.efficiencyModel}）`}
                    class="input w-full rounded-xl text-sm font-mono"
                    hx-get="/ui/fragments/model-pricing"
                    hx-trigger="change, keyup delay:400ms changed"
                    hx-target="#model-pricing"
                    hx-swap="innerHTML"
                    hx-include="this"
                  />
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                <i data-lucide="save" class="w-4 h-4" />
                <span>モデル設定を保存</span>
              </button>
            </div>
            <div id="model-save-result" class="empty:hidden"></div>
          </form>

          <form
            hx-put="/api/v1/settings/routing"
            hx-target="#routing-save-result"
            hx-swap="innerHTML"
            hx-disabled-elt="button[type='submit']"
            hx-ext="json-enc"
            class="card card-glass shadow-lg"
          >
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="git-branch" class="w-5 h-5 text-primary" />
                <span>モデル階層ルーティング（システム全体）</span>
              </h2>
              <p class="text-xs opacity-60 mb-4">
                コード生成前に
                <code class="font-mono"> {routing.clefModel}</code>{" "}
                が実装難易度を判定し、閾値以上で Performance、未満で Efficiency を選びます。
              </p>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="form-control">
                  <label class="label py-1" for="solThreshold">
                    <span class="label-text font-semibold opacity-75">Performance に上げる難易度（1〜5）</span>
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
                    <span class="label-text font-semibold opacity-75">判定モデル</span>
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
                <div class="form-control">
                  <label class="label py-1" for="efficiencyModel">
                    <span class="label-text font-semibold opacity-75">Efficiency モデル</span>
                  </label>
                  <input
                    type="text"
                    name="efficiencyModel"
                    id="efficiencyModel"
                    value={routing.efficiencyModel}
                    disabled={!isAdmin}
                    class="input w-full rounded-xl text-sm font-mono"
                  />
                </div>
                <div class="form-control">
                  <label class="label py-1" for="efficiencyEffort">
                    <span class="label-text font-semibold opacity-75">Efficiency の effort</span>
                  </label>
                  <select
                    name="efficiencyEffort"
                    id="efficiencyEffort"
                    disabled={!isAdmin}
                    class="select w-full rounded-xl text-sm font-mono"
                  >
                    {["none", "low", "medium", "high"].map((v) => (
                      <option value={v} selected={routing.efficiencyEffort === v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div class="form-control">
                  <label class="label py-1" for="performanceModel">
                    <span class="label-text font-semibold opacity-75">Performance モデル</span>
                  </label>
                  <input
                    type="text"
                    name="performanceModel"
                    id="performanceModel"
                    value={routing.performanceModel}
                    disabled={!isAdmin}
                    class="input w-full rounded-xl text-sm font-mono"
                  />
                </div>
                <div class="form-control">
                  <label class="label py-1" for="performanceEffort">
                    <span class="label-text font-semibold opacity-75">Performance の effort</span>
                  </label>
                  <select
                    name="performanceEffort"
                    id="performanceEffort"
                    disabled={!isAdmin}
                    class="select w-full rounded-xl text-sm font-mono"
                  >
                    {["none", "low", "medium", "high"].map((v) => (
                      <option value={v} selected={routing.performanceEffort === v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isAdmin && (
                <label class="label px-1 mt-2">
                  <span class="label-text-alt opacity-50">変更は管理者のみ可能です。</span>
                </label>
              )}

              <div class="mt-4 flex flex-wrap gap-3">
                <button
                  type="submit"
                  class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center"
                  disabled={!isAdmin}
                >
                  <i data-lucide="save" class="w-4 h-4" />
                  <span>ルーティング設定を保存</span>
                </button>
              </div>
              <div id="routing-save-result" class="empty:hidden"></div>
            </div>
          </form>

          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                <i data-lucide="waypoints" class="w-5 h-5 text-primary" />
                <span>Embedding モデル（固定）</span>
              </h2>
              <p class="text-xs opacity-60">
                コード検索はインデックスを持たず、リクエストごとに embedding します。デフォルトは
                <code class="font-mono"> {DEFAULT_EMBEDDING_MODEL}</code> を使用します。
                {embedding.length > 0 && (
                  <>
                    {" "}カタログ上の候補:{" "}
                    {embedding.map((m) => (
                      <code class="font-mono">{m.label}</code>
                    ))}
                  </>
                )}
              </p>
            </div>
          </div>
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
