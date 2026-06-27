import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface InspectionPageProps {
  user?: AuthedUser;
}

export const InspectionPage: FC<InspectionPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      {/* ページヘッダー */}
      <div class="mb-8">
        <h1 class="text-3xl font-extrabold tracking-tight text-base-content">
          AI コード解析 (Inspection)
        </h1>
        <p class="text-sm opacity-60 mt-1">
          指定したプログラミング言語のソースコードに対して、AI による6次元スコアリングと詳細な問題検出を実行します。
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* 左側: 解析フォーム (2カラム幅) */}
        <div class="xl:col-span-2 space-y-6">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6 md:p-8">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="scan-search" class="w-5 h-5 text-primary" />
                <span>新規コードスキャン</span>
              </h2>
              
              <form
                hx-post="/api/v1/inspect"
                hx-target="#inspect-result"
                hx-swap="innerHTML"
                hx-disabled-elt="button[type='submit']"
                class="space-y-6"
              >
                <div class="form-control">
                  <label class="label py-1" for="language">
                    <span class="label-text font-semibold opacity-75">対象言語</span>
                  </label>
                  <select
                    name="language"
                    id="language"
                    class="select select-bordered w-full input-glow rounded-xl mt-1 text-sm font-medium"
                    required
                  >
                    <option value="">-- 言語を選択してください --</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="rust">Rust</option>
                    <option value="go">Go</option>
                    <option value="java">Java</option>
                    <option value="csharp">C#</option>
                    <option value="ruby">Ruby</option>
                    <option value="php">PHP</option>
                    <option value="swift">Swift</option>
                  </select>
                </div>
                
                <div class="form-control">
                  <label class="label py-1" for="code">
                    <span class="label-text font-semibold opacity-75">ソースコード</span>
                  </label>
                  <textarea
                    name="code"
                    id="code"
                    class="textarea textarea-bordered w-full font-mono input-glow rounded-xl mt-1 text-xs leading-relaxed bg-black/30 placeholder-base-content/30"
                    rows={12}
                    placeholder="ここに解析したいソースコードを貼り付けてください..."
                    required
                  ></textarea>
                </div>
                
                <div class="form-control pt-2">
                  <button type="submit" class="btn btn-gradient rounded-xl py-3 h-auto gap-2 flex items-center justify-center">
                    <i data-lucide="play" class="w-4 h-4" />
                    <span>解析を実行する</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
          
          {/* 解析結果表示エリア */}
          <div id="inspect-result" class="empty:hidden transition-all duration-300"></div>
        </div>

        {/* 右側: 過去の履歴 (1カラム幅) */}
        <div class="xl:col-span-1">
          <div class="card card-glass shadow-lg">
            <div class="card-body p-6">
              <h2 class="card-title text-lg font-bold flex items-center gap-2 mb-6">
                <i data-lucide="history" class="w-5 h-5 text-secondary" />
                <span>スキャン履歴</span>
              </h2>
              
              <div
                hx-get="/api/v1/history"
                hx-trigger="load"
                hx-target="this"
                hx-swap="innerHTML"
              >
                {/* 履歴読み込み中のプレースホルダー */}
                <div class="space-y-4">
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                  <div class="skeleton h-16 w-full rounded-xl"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
export { InspectionPageProps };
