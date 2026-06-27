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
        <div class="brand-panel hidden lg:flex lg:w-1/2 items-center justify-center p-12 relative overflow-hidden border-r border-[var(--glass-border)]">
          {/* 背景の幾何学的装飾 */}
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div class="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-primary filter blur-[120px] opacity-40 animate-pulse"></div>
            <div class="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-secondary filter blur-[120px] opacity-40 animate-pulse delay-500"></div>
            <div class="absolute inset-0" style="background-image: radial-gradient(var(--glass-border) 1px, transparent 1px); background-size: 24px 24px;"></div>
          </div>
          
          <div class="relative z-10 text-center animate-float">
            <div class="brand-icon-box mb-6 inline-flex items-center justify-center w-24 h-24 rounded-lg shadow-lg">
              <i data-lucide="infinity" class="w-14 h-14 text-primary"></i>
            </div>
            <h1 class="brand-title text-6xl font-black mb-4 tracking-wider">
              Ouroboros
            </h1>
            <p class="brand-text text-lg max-w-md mx-auto leading-relaxed mb-8 font-medium">
              AI による継続的なコードスキャン、解析、<br />そして自動的な自己修復サイクル
            </p>
            
            <div class="brand-text flex justify-center gap-8">
              <div class="flex flex-col items-center gap-1.5">
                <div class="brand-badge p-3 rounded-xl"><i data-lucide="zap" class="w-5 h-5 text-[#FAAE40]"></i></div>
                <span class="text-xs font-semibold">高速修復</span>
              </div>
              <div class="flex flex-col items-center gap-1.5">
                <div class="brand-badge p-3 rounded-xl"><i data-lucide="shield-check" class="w-5 h-5 text-[#16A34A]"></i></div>
                <span class="text-xs font-semibold">安全第一</span>
              </div>
              <div class="flex flex-col items-center gap-1.5">
                <div class="brand-badge p-3 rounded-xl"><i data-lucide="git-branch" class="w-5 h-5 text-[#1F6FEB]"></i></div>
                <span class="text-xs font-semibold">PR自動化</span>
              </div>
              <div class="flex flex-col items-center gap-1.5">
                <div class="brand-badge p-3 rounded-xl"><i data-lucide="bot" class="w-5 h-5 text-[#FF6633]"></i></div>
                <span class="text-xs font-semibold">AI駆動</span>
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

                {/* ログイン失敗時のエラーメッセージを表示するコンテナ */}
                <div id="login-error" class="mb-6 empty:hidden"></div>

                {/* hx-target を #login-error、hx-swap を innerHTML に修正してフォームが消えるバグを解消 */}
                <form hx-post={action} hx-target="#login-error" hx-swap="innerHTML" class="space-y-6">
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
