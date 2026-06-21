import type { FC } from "hono/jsx";
import { LayoutPublic } from "../layout-public";

interface LoginPageProps {
  next?: string;
}

export const LoginPage: FC<LoginPageProps> = ({ next }) => {
  const action = next ? `/api/v1/auth/login?next=${encodeURIComponent(next)}` : "/api/v1/auth/login";

  return (
    <LayoutPublic title="Login" wide>
      <div class="flex flex-col lg:flex-row min-h-screen">
        <div class="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary to-secondary items-center justify-center p-12 relative overflow-hidden">
          <div class="absolute inset-0 bg-black/10"></div>
          <div class="relative z-10 text-center text-primary-content">
            <div class="mb-6">
              <i data-lucide="infinity" class="w-20 h-20 mx-auto"></i>
            </div>
            <h1 class="text-5xl font-bold mb-4 tracking-tight">Ouroboros</h1>
            <p class="text-xl opacity-90 mb-8">エッジネイティブな<br />AI自己修復システム</p>
            <div class="flex justify-center gap-6 opacity-70">
              <i data-lucide="zap" class="w-6 h-6"></i>
              <i data-lucide="shield-check" class="w-6 h-6"></i>
              <i data-lucide="git-branch" class="w-6 h-6"></i>
              <i data-lucide="bot" class="w-6 h-6"></i>
            </div>
          </div>
        </div>

        <div class="w-full lg:w-1/2 flex items-center justify-center p-4 md:p-12 bg-base-100 lg:bg-base-300">
          <div class="w-full max-w-md">
            <div class="lg:hidden text-center mb-8">
              <i data-lucide="infinity" class="w-12 h-12 mx-auto text-primary mb-2"></i>
              <h1 class="text-3xl font-bold">Ouroboros</h1>
              <p class="text-base-content/60 text-sm mt-1">AI自己修復システム</p>
            </div>

            <div class="card bg-base-100 shadow-2xl shadow-primary/10 hover:shadow-primary/20 transition-all duration-300">
              <div class="card-body p-8">
                <h2 class="card-title justify-center text-2xl mb-6">ログイン</h2>

                <form hx-post={action} hx-target="this" hx-swap="outerHTML">
                  <div class="form-control mb-4">
                    <label class="label" for="email">
                      <span class="label-text font-medium">メールアドレス</span>
                    </label>
                    <div class="relative">
                      <i data-lucide="mail" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40"></i>
                      <input
                        type="email"
                        name="email"
                        id="email"
                        placeholder="you@example.com"
                        class="input input-bordered w-full pl-10 focus:input-primary transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  <div class="form-control mb-6">
                    <label class="label" for="password">
                      <span class="label-text font-medium">パスワード</span>
                    </label>
                    <div class="relative">
                      <i data-lucide="lock" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-base-content/40"></i>
                      <input
                        type="password"
                        name="password"
                        id="password"
                        placeholder="••••••••"
                        class="input input-bordered w-full pl-10 focus:input-primary transition-all duration-200"
                        required
                      />
                    </div>
                  </div>

                  <div class="form-control mb-4">
                    <button
                      type="submit"
                      class="btn btn-primary w-full bg-gradient-to-r from-primary to-secondary border-0 hover:scale-[1.02] transition-all duration-200"
                    >
                      <i data-lucide="log-in" class="w-5 h-5"></i>
                      ログイン
                    </button>
                  </div>

                  <div class="text-center text-sm">
                    <a href="/register" class="link link-primary no-underline hover:underline">
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
