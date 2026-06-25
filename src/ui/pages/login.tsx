import type { FC } from "hono/jsx";
import { LayoutPublic } from "../layout-public";

interface LoginPageProps {
  next?: string;
}

export const LoginPage: FC<LoginPageProps> = ({ next }) => {
  const action = next ? `/api/v1/auth/login?next=${encodeURIComponent(next)}` : "/api/v1/auth/login";

  return (
    <LayoutPublic title="ログイン" wide>
      <div class="flex flex-col lg:flex-row min-h-screen">
        {/* 左パネル: ブランディングと装飾 */}
        <div class="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-950 items-center justify-center p-12 relative overflow-hidden border-r border-[var(--glass-border)]">
          {/* 背景の幾何学的装飾 (CSSパーティクル/グリッド風) */}
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div class="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-primary filter blur-[120px] animate-pulse"></div>
            <div class="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-secondary filter blur-[120px] animate-pulse delay-500"></div>
            <div class="absolute inset-0" style="background-image: radial-gradient(var(--glass-border) 1px, transparent 1px); background-size: 24px 24px;"></div>
          </div>
          
          <div class="relative z-10 text-center text-primary-content animate-float">
            <div class="mb-6 inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-2xl">
              <i data-lucide="infinity" class="w-14 h-14 text-primary"></i>
            </div>
            <h1 class="text-6xl font-black mb-4 tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
              Ouroboros
            </h1>
            <p class="text-lg opacity-80 max-w-md mx-auto leading-relaxed mb-8">
              AI による継続的なコードスキャン、解析、<br />そして自動的な自己修復サイクル
            </p>
            <div class="flex justify-center gap-8 opacity-75">
              <div class="flex flex-col items-center gap-1">
                <div class="p-3 rounded-xl bg-white/5 border border-white/10"><i data-lucide="zap" class="w-5 h-5 text-yellow-400"></i></div>
                <span class="text-xs">高速修復</span>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div class="p-3 rounded-xl bg-white/5 border border-white/10"><i data-lucide="shield-check" class="w-5 h-5 text-emerald-400"></i></div>
                <span class="text-xs">安全第一</span>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div class="p-3 rounded-xl bg-white/5 border border-white/10"><i data-lucide="git-branch" class="w-5 h-5 text-blue-400"></i></div>
                <span class="text-xs">PR自動化</span>
              </div>
              <div class="flex flex-col items-center gap-1">
                <div class="p-3 rounded-xl bg-white/5 border border-white/10"><i data-lucide="bot" class="w-5 h-5 text-purple-400"></i></div>
                <span class="text-xs">AI駆動</span>
              </div>
            </div>
          </div>
        </div>

        {/* 右パネル: ログインフォーム */}
        <div class="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-16 bg-base-300">
          <div class="w-full max-w-md">
            {/* モバイル用ヘッダー */}
            <div class="lg:hidden text-center mb-8">
              <i data-lucide="infinity" class="w-14 h-14 mx-auto text-primary mb-2"></i>
              <h1 class="text-4xl font-extrabold tracking-tight">Ouroboros</h1>
              <p class="text-base-content/60 text-sm mt-1">AI自己修復システム</p>
            </div>

            <div class="card card-glass shadow-2xl">
              <div class="card-body p-8 md:p-10">
                <h2 class="card-title justify-center text-3xl font-extrabold mb-8 tracking-wide text-base-content">
                  サインイン
                </h2>

                <form hx-post={action} hx-target="this" hx-swap="outerHTML" class="space-y-6">
                  <div class="form-control">
                    <label class="label px-1 py-1" for="email">
                      <span class="label-text font-semibold opacity-75">メールアドレス</span>
                    </label>
                    <div class="relative mt-1">
                      <i data-lucide="mail" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40"></i>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        placeholder="you@example.com"
                        class="input input-bordered w-full pl-10 input-glow rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div class="form-control">
                    <div class="flex justify-between items-center px-1">
                      <label class="label py-1" for="password">
                        <span class="label-text font-semibold opacity-75">パスワード</span>
                      </label>
                    </div>
                    <div class="relative mt-1">
                      <i data-lucide="lock" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40"></i>
                      <input
                        type="password"
                        name="password"
                        id="password"
                        placeholder="••••••••"
                        class="input input-bordered w-full pl-10 input-glow rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div class="form-control pt-4">
                    <button
                      type="submit"
                      class="btn btn-gradient w-full rounded-xl py-3 h-auto gap-2 flex items-center justify-center"
                    >
                      <i data-lucide="log-in" class="w-5 h-5"></i>
                      ログイン
                    </button>
                  </div>

                  <div class="divider text-xs opacity-40">または</div>

                  <div class="text-center">
                    <span class="text-sm opacity-60">アカウントをお持ちでないですか？</span>
                    <a href="/register" class="link link-primary font-semibold ml-2 hover:opacity-80 transition-opacity">
                      アカウントを作成
                    </a>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutPublic>
  );
};
export { LoginPageProps };
