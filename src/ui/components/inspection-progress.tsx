import type { FC } from "hono/jsx";

export interface ProgressStep {
  step: string;
  message: string;
  at: number;
}

interface InspectionProgressProps {
  id: string;
  status: string;
  steps: ProgressStep[];
}

const STEP_LABELS: Record<string, string> = {
  queued: "待機中",
  indexing: "インデックス構築",
  searching: "Vectorize 検索",
  analyzing: "AI 解析",
  completed: "完了",
  failed: "失敗",
};

const STEP_ORDER = ["queued", "indexing", "searching", "analyzing", "completed"];

/**
 * 解析パイプラインの進捗表示。status が completed/failed 以外の間は
 * 3 秒ごとに /ui/fragments/inspections/:id をポーリングし、完了で詳細に切り替わる。
 */
export const InspectionProgress: FC<InspectionProgressProps> = ({ id, status, steps }) => {
  const inProgress = status !== "completed" && status !== "failed";
  const currentIdx = STEP_ORDER.indexOf(status);

  return (
    <div
      class="card card-glass shadow-lg"
      hx-get={inProgress ? `/ui/fragments/inspections/${id}` : undefined}
      hx-trigger={inProgress ? "load delay:3s" : undefined}
      hx-target="this"
      hx-swap="outerHTML"
    >
      <div class="card-body p-6">
        <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-4">
          {inProgress ? (
            <span class="loading loading-spinner loading-sm text-primary"></span>
          ) : status === "failed" ? (
            <i data-lucide="alert-circle" class="w-5 h-5 text-error" />
          ) : (
            <i data-lucide="check-circle" class="w-5 h-5 text-success" />
          )}
          <span>解析の進行状況</span>
        </h2>

        {/* ステップインジケーター */}
        <ul class="steps steps-vertical w-full text-sm">
          {STEP_ORDER.filter((s) => s !== "queued").map((s) => {
            const idx = STEP_ORDER.indexOf(s);
            const done = currentIdx > idx || status === "completed";
            const active = status === s;
            return (
              <li class={`step ${done || active ? "step-primary" : ""}`}>
                {STEP_LABELS[s] ?? s}
              </li>
            );
          })}
        </ul>

        {/* ステップログ */}
        {steps.length > 0 && (
          <div class="mt-4 space-y-1 text-xs opacity-75 border-t border-[var(--glass-border)] pt-3">
            {steps.map((step) => (
              <div class="flex gap-2">
                <span class="font-mono opacity-50">
                  {new Date(step.at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </span>
                <span class="font-semibold">{STEP_LABELS[step.step] ?? step.step}:</span>
                <span>{step.message}</span>
              </div>
            ))}
          </div>
        )}

        {status === "failed" && (
          <div class="alert alert-error rounded-lg text-sm mt-3">
            <i data-lucide="alert-circle" class="w-4 h-4" />
            <span>解析に失敗しました。時間をおいて再度お試しください。</span>
          </div>
        )}
      </div>
    </div>
  );
};
