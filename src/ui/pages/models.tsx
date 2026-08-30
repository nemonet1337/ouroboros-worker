import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { AiModelInfo } from "../../ports/ai";
import {
  DEFAULT_EMBEDDING_MODEL,
  DEFAULT_WORKERS_AI_MODEL,
  isCompatibleEmbeddingModel,
  isEmbeddingTask,
  isTextGenerationTask,
} from "../../config/deployment";
import { Layout } from "../layout";
import { ModelPricingPanel } from "../components/model-pricing";

interface ModelsPageProps {
  user?: AuthedUser;
  models?: AiModelInfo[];
  selectedModel?: string | null;
  selectedEmbedding?: string;
  defaultModel?: string;
  defaultEmbedding?: string;
}

function splitModels(models: AiModelInfo[]): { text: AiModelInfo[]; embedding: AiModelInfo[] } {
  const text: AiModelInfo[] = [];
  const embedding: AiModelInfo[] = [];
  for (const m of models) {
    if (isEmbeddingTask(m.task)) {
      if (isCompatibleEmbeddingModel(m.value, m.outputDimensions)) embedding.push(m);
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
  selectedEmbedding = DEFAULT_EMBEDDING_MODEL,
  defaultModel = DEFAULT_WORKERS_AI_MODEL,
  defaultEmbedding = DEFAULT_EMBEDDING_MODEL,
}) => {
  const isAdmin = user?.role === "admin";
  const { text, embedding } = splitModels(models);
  const preview =
    models.find((m) => m.value === (selectedModel || defaultModel)) ??
    models.find((m) => m.value === selectedEmbedding) ??
    null;

  return (
    <Layout user={user}>
      <datalist id="text-gen-models">
        {text.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>
      <datalist id="embedding-models">
        {embedding.map((m) => (
          <option value={m.value}>{m.label}</option>
        ))}
      </datalist>

      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">モデル設定</h1>
        <p class="text-sm opacity-60 mt-1">
          テキスト生成と Embedding に使う Cloudflare Workers AI モデルを選びます。選択すると右枠にカタログ上の単価を表示します。
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
                  <span>テキスト生成モデル</span>
                </h2>
                <p class="text-xs opacity-60 mb-4">
                  コード生成・検査・自己修復など、すべての推論で使います。空欄は
                  <code class="font-mono"> {defaultModel}</code> です。この設定はユーザーごとに保存されます。
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
                    placeholder={`システムデフォルト（${defaultModel}）`}
                    class="input input-bordered w-full rounded-xl text-sm font-mono"
                    hx-get="/ui/fragments/model-pricing"
                    hx-trigger="change, keyup delay:400ms changed"
                    hx-target="#model-pricing"
                    hx-swap="innerHTML"
                    hx-include="this"
                  />
                </div>
              </div>
            </div>

            <div class="card card-glass shadow-lg">
              <div class="card-body p-6 md:p-8">
                <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
                  <i data-lucide="waypoints" class="w-5 h-5 text-primary" />
                  <span>Embedding モデル</span>
                </h2>
                <p class="text-xs opacity-60 mb-4">
                  コードインデックス（Vectorize, 768 次元）で使います。デフォルトは
                  <code class="font-mono"> {defaultEmbedding}</code>。システム全体で 1 つです。
                  変更後はインデックスの再構築が必要です。
                </p>
                <div class="form-control">
                  <label class="label py-1" for="embeddingModel">
                    <span class="label-text font-semibold opacity-75">モデル ID</span>
                  </label>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      name="embeddingModel"
                      id="embeddingModel"
                      list="embedding-models"
                      value={selectedEmbedding}
                      placeholder={defaultEmbedding}
                      class="input input-bordered w-full rounded-xl text-sm font-mono"
                      disabled={!isAdmin}
                      hx-get="/ui/fragments/model-pricing"
                      hx-trigger="change, keyup delay:400ms changed"
                      hx-target="#model-pricing"
                      hx-swap="innerHTML"
                      hx-include="this"
                    />
                    <button
                      type="button"
                      class="btn btn-ghost rounded-xl"
                      hx-get={`/ui/fragments/model-pricing?embeddingModel=${encodeURIComponent(selectedEmbedding)}`}
                      hx-target="#model-pricing"
                      hx-swap="innerHTML"
                    >
                      料金
                    </button>
                  </div>
                  {!isAdmin && (
                    <label class="label px-1">
                      <span class="label-text-alt opacity-50">変更は管理者のみ可能です。料金ボタンで右枠を更新できます。</span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                <i data-lucide="save" class="w-4 h-4" />
                <span>モデル設定を保存</span>
              </button>
              {isAdmin && (
                <button
                  type="button"
                  class="btn btn-outline rounded-xl py-3 h-auto gap-2"
                  hx-post="/api/v1/code-index/reindex"
                  hx-target="#model-save-result"
                  hx-swap="innerHTML"
                  hx-disabled-elt="this"
                >
                  <i data-lucide="refresh-cw" class="w-4 h-4" />
                  <span>コードインデックスを再構築</span>
                </button>
              )}
            </div>
            <div id="model-save-result" class="empty:hidden"></div>
          </form>
        </div>

        <div class="xl:col-span-1 xl:sticky xl:top-20">
          <div id="model-pricing">
            <ModelPricingPanel model={preview} query={selectedModel || selectedEmbedding} />
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { ModelsPageProps };
