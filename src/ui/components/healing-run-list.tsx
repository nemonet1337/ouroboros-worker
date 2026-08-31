import type { FC } from "hono/jsx";
import type { HealingRunRow } from "../../db/repositories";
import {
  HEALING_STATUS_LABELS,
  HEALING_TRIGGER_LABELS,
  isHealingActive,
} from "../../healing/status";
import { parseHealingSummary } from "../../healing/summary";

export interface HealingRunListProps {
  runs: HealingRunRow[];
  oob?: boolean;
  page?: number;
  hasNext?: boolean;
  statusFilter?: string;
}

const FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "すべて" },
  { value: "active", label: "進行中" },
  { value: "analyzed", label: "解析完了" },
  { value: "done", label: "修復完了" },
  { value: "failed", label: "失敗" },
  { value: "canceled", label: "キャンセル" },
];

function runsUrl(page: number, statusFilter: string): string {
  const q = new URLSearchParams();
  q.set("page", String(page));
  if (statusFilter) q.set("status", statusFilter);
  return `/ui/fragments/healing/runs?${q.toString()}`;
}

function TokenLine(props: { model?: string | null; prompt?: number; completion?: number; label: string }) {
  const prompt = props.prompt ?? 0;
  const completion = props.completion ?? 0;
  if (!props.model && prompt === 0 && completion === 0) return null;
  return (
    <div class="text-xs opacity-60 font-mono truncate" title={props.model ?? ""}>
      {props.label}: {props.model ? props.model.replace(/^@[^/]+\//, "") : "—"} · in {prompt} / out {completion}
    </div>
  );
}

/**
 * 自己修復の解析・修復履歴（カード）。
 * カードクリックで詳細（レーダー）、解析完了時は修復ボタンでモーダルを開く。
 */
export const HealingRunList: FC<HealingRunListProps> = ({
  runs,
  oob,
  page = 1,
  hasNext = false,
  statusFilter = "",
}) => {
  const listUrl = runsUrl(page, statusFilter);
  const wrapperAttrs = {
    id: "healing-runs-list",
    "hx-swap-oob": oob ? "true" : undefined,
    "hx-get": listUrl,
    "hx-trigger": page === 1 ? "every 5s" : undefined,
    "hx-swap": "outerHTML",
  };

  const filterBar = (
    <div class="flex flex-wrap items-center gap-2 mb-4 px-1">
      <span class="text-xs font-semibold opacity-60 mr-1">ステータス:</span>
      {FILTER_OPTIONS.map((opt) => {
        const active = statusFilter === opt.value;
        return (
          <button
            type="button"
            class={`btn btn-sm rounded-full ${
              active ? "btn-primary" : "btn-outline border-[var(--glass-border)] hover:bg-base-200"
            }`}
            hx-get={runsUrl(1, opt.value)}
            hx-target="#healing-runs-list"
            hx-swap="outerHTML"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const pager = (
    <div class="flex items-center justify-between mt-4 px-1">
      <span class="text-xs opacity-60">ページ {page}</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200"
          disabled={page <= 1}
          hx-get={runsUrl(page - 1, statusFilter)}
          hx-target="#healing-runs-list"
          hx-swap="outerHTML"
        >
          <i data-lucide="chevron-left" class="w-4 h-4" />
          <span>前へ</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline rounded-lg border-[var(--glass-border)] hover:bg-base-200"
          disabled={!hasNext}
          hx-get={runsUrl(page + 1, statusFilter)}
          hx-target="#healing-runs-list"
          hx-swap="outerHTML"
        >
          <span>次へ</span>
          <i data-lucide="chevron-right" class="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  if (runs.length === 0) {
    return (
      <div {...wrapperAttrs}>
        {filterBar}
        <div class="card card-glass p-8 text-center text-base-content/50">
          <i data-lucide="wrench" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
          <p class="font-bold">
            {statusFilter ? "該当する実行はありません" : "解析・修復の履歴はありません"}
          </p>
          <p class="text-xs opacity-75 mt-1">
            {statusFilter
              ? "別のステータスフィルタを試すか、解析を実行してください。"
              : "解析を実行すると、結果がここにサマリとして残ります。"}
          </p>
        </div>
        {page > 1 && pager}
      </div>
    );
  }

  return (
    <div {...wrapperAttrs}>
      {filterBar}
      <div class="space-y-3">
        {runs.map((run) => {
          const status = HEALING_STATUS_LABELS[run.status] ?? { label: run.status, class: "badge-ghost" };
          const summary = parseHealingSummary(run.summary);
          const analysis = summary.analysis;
          const prs = (summary.prs ?? []).map((p) => (typeof p === "number" ? { number: p } : p));
          const overall = analysis?.overall;
          return (
            <div
              key={run.id}
              class="card card-glass border border-[var(--glass-border)] p-4 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <a href={`/healing/${run.id}`} class="flex flex-1 min-w-0 items-center gap-4 hover:opacity-90">
                <span
                  class={`text-2xl font-black tracking-tight w-12 text-center ${
                    overall !== undefined ? "text-primary" : "opacity-40"
                  }`}
                >
                  {overall !== undefined ? overall : "—"}
                </span>
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class={`badge badge-sm rounded-full font-bold ${status.class}`}>{status.label}</span>
                    <span class="text-xs opacity-50">{HEALING_TRIGGER_LABELS[run.trigger] ?? run.trigger}</span>
                    <span class="font-mono text-xs opacity-40">{run.id.slice(0, 8)}</span>
                  </div>
                  {analysis?.summary ? (
                    <p class="text-sm opacity-80 line-clamp-2">{analysis.summary}</p>
                  ) : summary.error ? (
                    <p class="text-sm text-rose-400 line-clamp-2">{summary.error}</p>
                  ) : (
                    <p class="text-xs opacity-50">
                      {new Date(run.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </p>
                  )}
                  <div class="flex flex-wrap gap-x-4 gap-y-1">
                    {analysis && (
                      <span class="text-xs opacity-60">
                        検出 {analysis.findingCount} · 自動修復可 {analysis.autoFixableCount}
                        {analysis.grade ? ` · ${analysis.grade}` : ""}
                      </span>
                    )}
                    {prs.length > 0 && <span class="text-xs opacity-60">PR {prs.length} 件</span>}
                  </div>
                  <TokenLine
                    label="解析"
                    model={run.model}
                    prompt={run.prompt_tokens}
                    completion={run.completion_tokens}
                  />
                  {(run.fix_model || run.fix_prompt_tokens || run.fix_completion_tokens) && (
                    <TokenLine
                      label="修復"
                      model={run.fix_model}
                      prompt={run.fix_prompt_tokens}
                      completion={run.fix_completion_tokens}
                    />
                  )}
                </div>
              </a>
              <div class="flex sm:flex-col gap-2 shrink-0">
                {run.status === "analyzed" && (
                  <button
                    type="button"
                    class="btn btn-sm btn-gradient rounded-lg"
                    {...{
                      "hx-get": `/ui/fragments/healing/${run.id}/fix-modal`,
                      "hx-target": "#healing-fix-modal-body",
                      "hx-swap": "innerHTML",
                      "hx-on::before-request":
                        "document.getElementById('healing_fix_modal')?.showModal()",
                      "hx-on::after-request": "if(window.lucide) lucide.createIcons()",
                    }}
                  >
                    修復
                  </button>
                )}
                {isHealingActive(run.status) && (
                  <button
                    type="button"
                    class="btn btn-xs btn-outline btn-error rounded-lg"
                    hx-post={`/ui/fragments/healing/${run.id}/cancel`}
                    hx-target="#healing-result"
                    hx-swap="innerHTML"
                    hx-confirm="この実行をキャンセルしますか？"
                  >
                    キャンセル
                  </button>
                )}
                <a href={`/healing/${run.id}`} class="btn btn-xs btn-ghost rounded-lg">
                  詳細
                </a>
              </div>
            </div>
          );
        })}
      </div>
      {pager}
    </div>
  );
};
