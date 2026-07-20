import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { CodeSessionRow, Patch } from "../../types";
import { Layout } from "../layout";

interface CodeSessionPageProps {
  sessionId: string;
  user?: AuthedUser;
  session?: CodeSessionRow;
}

const STATUS_BADGE: Record<string, string> = {
  initializing: "badge-info",
  ready: "badge-success",
  generating: "badge-warning",
  generated: "badge-primary",
  applying: "badge-warning",
  applied: "badge-success",
  failed: "badge-error",
  dismissed: "badge-ghost",
};

export const CodeSessionPage: FC<CodeSessionPageProps> = ({ sessionId, user, session }) => {
  if (!session) {
    return (
      <Layout user={user}>
        <div class="card card-glass shadow-lg p-8">
          <h1 class="text-2xl font-bold text-base-content mb-2">セッションが見つかりません</h1>
          <p class="text-sm opacity-60">ID: {sessionId}</p>
          <a href="/code" class="link link-primary mt-4">Code モードへ戻る</a>
        </div>
      </Layout>
    );
  }

  let patches: Patch[] = [];
  try {
    patches = session.generated_patches ? JSON.parse(session.generated_patches) : [];
  } catch {}

  return (
    <Layout user={user}>
      <div class="card card-glass shadow-lg p-8 space-y-6">
        {/* ヘッダー */}
        <div class="flex items-center justify-between border-b border-[var(--glass-border)] pb-4">
          <div>
            <h1 class="text-2xl font-bold text-base-content">{session.title}</h1>
            <p class="text-xs opacity-60 font-mono mt-1">{session.repo_url} @ {session.branch}</p>
          </div>
          <span class={`badge ${STATUS_BADGE[session.status] ?? "badge-ghost"} badge-lg`}>
            {session.status}
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-4">
            {/* 指示 */}
            <div>
              <h2 class="font-semibold text-sm opacity-75 mb-2">指示</h2>
              <div class="bg-base-200 rounded-xl p-4 text-sm whitespace-pre-wrap">{session.instruction}</div>
            </div>

            {/* Plan フェーズの実装計画 */}
            {session.plan ? (
              <div>
                <h2 class="font-semibold text-sm opacity-75 mb-2 flex items-center gap-2">
                  <i data-lucide="list-checks" class="w-4 h-4 text-primary" />
                  実装計画（Plan モデルによる生成）
                </h2>
                <div class="bg-base-200 rounded-xl p-4 text-sm whitespace-pre-wrap">{session.plan}</div>
              </div>
            ) : null}

            {/* 生成パッチ */}
            {patches.length > 0 ? (
              <div>
                <h2 class="font-semibold text-sm opacity-75 mb-2">生成されたパッチ（{patches.length} 件）</h2>
                <div class="space-y-3">
                  {patches.map((p) => (
                    <div class="bg-base-200 rounded-xl p-4">
                      <div class="font-mono text-xs font-semibold mb-1">{p.file}</div>
                      <div class="text-xs opacity-70 mb-2">{p.explanation}</div>
                      {p.diff ? (
                        <pre class="text-xs overflow-x-auto bg-base-300 rounded-lg p-3">{p.diff}</pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 生成失敗時のエラー理由 */}
            {session.status === "failed" && session.error_message ? (
              <div class="alert alert-error text-sm">
                <i data-lucide="alert-triangle" class="w-4 h-4" />
                <span>{session.error_message}</span>
              </div>
            ) : null}
          </div>

          {/* サイドパネル: アクション */}
          <div class="lg:col-span-1 space-y-4">
            <div class="bg-base-200 rounded-xl p-4 space-y-3">
              <h2 class="font-semibold text-sm opacity-75">アクション</h2>
              {(session.status === "ready" || session.status === "failed") && (
                <>
                  {/* 生成モード選択（Plan+Code / Code のみ） */}
                  <div class="form-control" id="code-mode-inputs">
                    <label class="label cursor-pointer justify-start gap-2 py-1">
                      <input
                        type="radio"
                        name="codeMode"
                        value="plan_code"
                        class="radio radio-primary radio-sm"
                        checked={session.mode !== "code_only"}
                      />
                      <span class="label-text text-xs">Plan + Code（計画を立ててから生成）</span>
                    </label>
                    <label class="label cursor-pointer justify-start gap-2 py-1">
                      <input
                        type="radio"
                        name="codeMode"
                        value="code_only"
                        class="radio radio-primary radio-sm"
                        checked={session.mode === "code_only"}
                      />
                      <span class="label-text text-xs">Code のみ（計画なしで直接生成）</span>
                    </label>
                  </div>
                  <button
                    hx-post={`/ui/fragments/code/sessions/${session.id}/generate`}
                    hx-target="#session-action-result"
                    hx-swap="innerHTML"
                    hx-include="#code-mode-inputs"
                    class="btn btn-gradient btn-sm w-full rounded-xl gap-2"
                  >
                    <i data-lucide="sparkles" class="w-4 h-4" />
                    パッチを生成
                  </button>
                </>
              )}
              {session.status === "generated" && (
                <button
                  hx-post={`/ui/fragments/code/sessions/${session.id}/apply`}
                  hx-target="#session-action-result"
                  hx-swap="innerHTML"
                  class="btn btn-gradient btn-sm w-full rounded-xl gap-2"
                >
                  <i data-lucide="git-pull-request" class="w-4 h-4" />
                  PR を作成
                </button>
              )}
              <button
                onclick="location.reload()"
                class="btn btn-ghost btn-sm w-full rounded-xl gap-2"
              >
                <i data-lucide="refresh-cw" class="w-4 h-4" />
                状態を更新
              </button>
              <div id="session-action-result" class="empty:hidden text-xs"></div>
            </div>

            {session.pr_url ? (
              <div class="bg-base-200 rounded-xl p-4">
                <h2 class="font-semibold text-sm opacity-75 mb-2">Pull Request</h2>
                <a href={session.pr_url} target="_blank" class="link link-primary text-sm font-mono">
                  #{session.pr_number}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { CodeSessionPageProps };
