import type { FC } from "hono/jsx";
import type { VcsRepo } from "../../ports/vcs";

interface RepoSelectorProps {
  repos: VcsRepo[];
  selected: { owner: string; repo: string } | null;
  error?: string;
}

/**
 * 対象リポジトリの選択 UI。ネイティブの datalist で検索でき、任意の owner/name も
 * 直接入力できる。選択はシステム全体で 1 つ（settings.selected_repo）。
 */
export const RepoSelector: FC<RepoSelectorProps> = ({ repos, selected, error }) => {
  const current = selected ? `${selected.owner}/${selected.repo}` : "";
  return (
    <div class="card-body p-6" id="repo-selector-body">
      <h2 class="card-title text-lg font-bold flex items-center gap-2">
        <i data-lucide="github" class="w-5 h-5 text-primary" />
        <span>対象リポジトリ</span>
      </h2>
      <p class="text-xs opacity-60 mb-2">
        コード解析・自己修復・コード編集の対象となるリポジトリをシステム全体で 1 つ選択します。
      </p>

      {error && (
        <div class="alert alert-error rounded-lg flex items-center gap-2 text-sm mb-2">
          <i data-lucide="alert-circle" class="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      <div class="text-xs opacity-70 mb-3">
        現在の選択:{" "}
        {current ? (
          <span class="font-mono font-bold text-primary">{current}</span>
        ) : (
          <span class="text-warning">未選択</span>
        )}
      </div>

      <form
        hx-post="/ui/fragments/repos/select"
        hx-target="#repo-selector-body"
        hx-swap="outerHTML"
        hx-disabled-elt="button[type='submit']"
        class="flex flex-col sm:flex-row gap-2 items-stretch"
      >
        <input
          type="text"
          name="repo"
          list="repo-list"
          placeholder="owner/name を検索または入力"
          value={current}
          class="input input-bordered flex-1 input-glow rounded-xl text-sm font-mono"
          required
        />
        <datalist id="repo-list">
          {repos.map((r) => (
            <option value={r.fullName}>{r.description ? `${r.fullName} — ${r.description}` : r.fullName}</option>
          ))}
        </datalist>
        <button type="submit" class="btn btn-gradient rounded-xl gap-2">
          <i data-lucide="check" class="w-4 h-4" />
          <span>選択</span>
        </button>
      </form>
      {repos.length === 0 && (
        <p class="text-xs opacity-50 mt-2">
          アクセス可能なリポジトリ一覧を取得できませんでした。owner/name を直接入力してください。
        </p>
      )}
    </div>
  );
};
