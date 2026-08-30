import type { FC } from "hono/jsx";
import type { AiModelInfo } from "../../ports/ai";

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 4,
    }).format(price);
  } catch {
    return `$${price}`;
  }
}

export const ModelPricingPanel: FC<{ model?: AiModelInfo | null; query?: string }> = ({
  model,
  query,
}) => {
  return (
    <div class="card card-glass shadow-lg">
      <div class="card-body p-6">
        <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-2">
          <i data-lucide="circle-dollar-sign" class="w-5 h-5 text-accent" />
          <span>料金</span>
        </h2>

        {!model ? (
          <p class="text-sm opacity-60">
            {query
              ? `「${query}」のカタログ情報を取得できませんでした。保存はできますが、単価は未公開です。`
              : "左のモデルを選ぶと、Workers AI カタログから単価を取得して表示します。"}
          </p>
        ) : (
          <div class="space-y-4">
            <div>
              <p class="text-sm font-semibold break-all">{model.label}</p>
              <p class="text-xs font-mono opacity-50 break-all mt-0.5">{model.value}</p>
              {model.task && (
                <span class="badge badge-ghost badge-sm mt-2">{model.task}</span>
              )}
            </div>

            {model.description && (
              <p class="text-xs opacity-70 leading-relaxed">{model.description}</p>
            )}

            <div class="divider my-1 text-xs opacity-40">単価</div>

            {model.pricing && model.pricing.length > 0 ? (
              <ul class="space-y-2">
                {model.pricing.map((p) => (
                  <li class="flex items-baseline justify-between gap-3 text-sm">
                    <span class="opacity-70">{p.unit || "unit"}</span>
                    <span class="font-mono font-semibold">{formatPrice(p.price, p.currency)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="text-sm opacity-60">料金はカタログ未公開です（beta モデルなど）。</p>
            )}

            {(model.contextWindow || model.outputDimensions) && (
              <div class="divider my-1 text-xs opacity-40">スペック</div>
            )}
            <dl class="space-y-1 text-sm">
              {model.contextWindow ? (
                <div class="flex justify-between gap-3">
                  <dt class="opacity-70">コンテキスト</dt>
                  <dd class="font-mono">{model.contextWindow.toLocaleString()} tokens</dd>
                </div>
              ) : null}
              {model.outputDimensions ? (
                <div class="flex justify-between gap-3">
                  <dt class="opacity-70">出力次元</dt>
                  <dd class="font-mono">{model.outputDimensions}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        )}
        <script dangerouslySetInnerHTML={{ __html: "lucide.createIcons()" }} />
      </div>
    </div>
  );
};
