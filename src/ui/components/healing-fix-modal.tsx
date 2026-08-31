import type { FC } from "hono/jsx";
import type { HealingRunRow } from "../../db/repositories";
import { parseHealingSummary } from "../../healing/summary";

interface HealingFixModalBodyProps {
  run: HealingRunRow;
}

/** 修復確認モーダルの中身。解析サマリとグループ、ドライランを提示する。 */
export const HealingFixModalBody: FC<HealingFixModalBodyProps> = ({ run }) => {
  const summary = parseHealingSummary(run.summary);
  const groups = summary.groups ?? [];
  const autoFixable = groups.filter((g) => g.autoFixable);
  const model = (run.model ?? "").replace(/^@[^/]+\//, "") || "（ユーザー設定）";

  return (
    <form
      hx-post={`/ui/fragments/healing/${run.id}/fix`}
      hx-target="#healing-result"
      hx-swap="innerHTML"
      hx-disabled-elt="button[type='submit']"
      class="space-y-4"
    >
      <p class="text-sm opacity-80">
        解析結果をもとに自動修復を開始します。自動修復可能なグループだけが PR になります。シークレットはエスカレーションされます。
      </p>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div class="text-xs opacity-50">自動修復可能</div>
          <div class="font-bold">{autoFixable.length} / {groups.length} グループ</div>
        </div>
        <div>
          <div class="text-xs opacity-50">解析モデル</div>
          <div class="font-mono text-xs truncate">{model}</div>
        </div>
        <div>
          <div class="text-xs opacity-50">解析トークン</div>
          <div class="font-mono text-xs">
            in {run.prompt_tokens ?? 0} / out {run.completion_tokens ?? 0}
          </div>
        </div>
        <div>
          <div class="text-xs opacity-50">総合スコア</div>
          <div class="font-bold">{summary.analysis?.overall ?? "—"} {summary.analysis?.grade ?? ""}</div>
        </div>
      </div>
      {groups.length > 0 && (
        <ul class="max-h-48 overflow-y-auto space-y-1 text-xs rounded-lg bg-base-200/40 p-3">
          {groups.map((g) => (
            <li class="flex items-center justify-between gap-2">
              <span class="truncate">{g.fixStrategy.title}</span>
              <span class={`badge badge-xs ${g.autoFixable ? "badge-success" : "badge-ghost"}`}>
                {g.autoFixable ? "自動" : "手動"} · {g.priority}
              </span>
            </li>
          ))}
        </ul>
      )}
      <label class="label cursor-pointer justify-start gap-2">
        <input type="checkbox" name="dryRun" value="true" class="checkbox checkbox-sm" />
        <span class="label-text text-sm">ドライラン（変更を適用せず検証のみ）</span>
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn btn-sm rounded-lg" onclick="document.getElementById('healing_fix_modal')?.close()">
          キャンセル
        </button>
        <button type="submit" class="btn btn-sm btn-gradient rounded-lg" onclick="document.getElementById('healing_fix_modal')?.close()">
          修復を開始
        </button>
      </div>
    </form>
  );
};

/** ページに固定する空の dialog。htmx で body だけ差し替える。 */
export const HealingFixModalShell: FC = () => (
  <dialog
    id="healing_fix_modal"
    class="relative m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-[var(--glass-border)] bg-base-100 p-6 text-base-content shadow-2xl backdrop:bg-black/50"
    onclick="if (event.target === this) this.close()"
  >
    <form method="dialog">
      <button type="submit" class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="閉じる">
        ✕
      </button>
    </form>
    <h3 class="mb-1 flex items-center gap-2 text-lg font-bold">
      <i data-lucide="wrench" class="h-5 w-5 text-primary" />
      自動修復
    </h3>
    <p class="mb-4 text-xs opacity-50">解析結果をもとに修正を開始します。</p>
    <div id="healing-fix-modal-body" class="min-h-16">
      <p class="text-sm opacity-50">修復対象を読み込み中…</p>
    </div>
  </dialog>
);
