import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import type { CodeSessionRow, HarnessTrace, Patch } from "../../types";
import { Layout } from "../layout";

interface CodeSessionPageProps {
  sessionId: string;
  user?: AuthedUser;
  session?: CodeSessionRow;
  harnessTrace?: HarnessTrace | null;
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

export const CodeSessionPage: FC<CodeSessionPageProps> = ({ sessionId, user, session, harnessTrace }) => {
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

        {/* 生成中ポーリング */}
        {(session.status === "generating" || session.status === "ready" || session.status === "failed") && (
          <div
            id="code-session-status"
            hx-get={
              session.status === "generating"
                ? `/ui/fragments/code/sessions/${sessionId}/status`
                : undefined
            }
            hx-trigger={session.status === "generating" ? "every 5s" : undefined}
            hx-swap="outerHTML"
          />
        )}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-4">
            {/* 指示 */}
            <div>
              <h2 class="font-semibold text-sm opacity-75 mb-2">指示</h2>
              <div class="bg-base-200 rounded-xl p-4 text-sm whitespace-pre-wrap">{session.instruction}</div>
            </div>

            {harnessTrace ? (
              <details class="bg-base-200 rounded-xl p-4">
                <summary class="font-semibold text-sm opacity-75 cursor-pointer">
                  コーディングハーネス（参照 {harnessTrace.selectedPaths.length} ファイル / repair {harnessTrace.repairAttempts}）
                </summary>
                <div class="mt-3 space-y-2 text-xs">
                  <p>
                    検索ソース: <span class="font-mono">{harnessTrace.source}</span>
                    {" · "}
                    スニペット {harnessTrace.snippetCount} 件
                  </p>
                  {harnessTrace.selectedPaths.length > 0 ? (
                    <ul class="list-disc pl-4 font-mono">
                      {harnessTrace.selectedPaths.map((p) => (
                        <li>{p}</li>
                      ))}
                    </ul>
                  ) : (
                    <p class="opacity-60">参照ファイルはありません</p>
                  )}
                  {harnessTrace.verifyWarnings.length > 0 ? (
                    <ul class="text-warning list-disc pl-4">
                      {harnessTrace.verifyWarnings.map((w) => (
                        <li>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                  {harnessTrace.verifyErrors.length > 0 ? (
                    <ul class="text-error list-disc pl-4">
                      {harnessTrace.verifyErrors.map((e) => (
                        <li>{e}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ) : null}

            {/* Clef によるモデル階層判定 */}
            {session.route_model ? (
              <div>
                <h2 class="font-semibold text-sm opacity-75 mb-2 flex items-center gap-2">
                  <i data-lucide="git-branch" class="w-4 h-4 text-primary" />
                  モデル階層（Clef 判定）
                </h2>
                <div class="bg-base-200 rounded-xl p-4 text-xs space-y-1">
                  <div>
                    難易度:{" "}
                    <span class="font-mono font-semibold">
                      {session.difficulty ?? "—"}
                    </span>
                    　階層:{" "}
                    <span class="font-mono">
                      {session.tier === "performance"
                        ? "Performance"
                        : session.tier === "efficiency"
                          ? "Efficiency"
                          : "—"}
                    </span>
                  </div>
                  <div class="opacity-70">
                    使用モデル:{" "}
                    <span class="font-mono">
                      {(session.route_model ?? "").replace(/^@[^/]+\//, "")}
                    </span>
                    {session.route_effort ? (
                      <>
                        {" "}
                        (effort: <span class="font-mono">{session.route_effort}</span>)
                      </>
                    ) : null}
                  </div>
                </div>
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
                <button
                  hx-post={`/ui/fragments/code/sessions/${session.id}/generate`}
                  hx-target="#session-action-result"
                  hx-swap="innerHTML"
                  class="btn btn-gradient btn-sm w-full rounded-xl gap-2"
                >
                  <i data-lucide="sparkles" class="w-4 h-4" />
                  パッチを生成
                </button>
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
