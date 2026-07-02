import type { FC, PropsWithChildren } from "hono/jsx";
import { AppHead } from "./head";

export interface LayoutPublicProps {
  title?: string;
  wide?: boolean;
}

export const LayoutPublic: FC<PropsWithChildren<LayoutPublicProps>> = ({
  title = "Ouroboros",
  wide = false,
  children,
}) => {
  const mainClass = wide
    ? "flex-1 w-full"
    : "flex-1 p-4 md:p-8 max-w-lg mx-auto w-full flex flex-col justify-center min-h-screen animate-fade-in-up";

  return (
    <html lang="ja" data-theme="winter">
      <AppHead title={`${title} - Ouroboros`} />
      <body class="min-h-screen bg-base-300 transition-colors duration-200">
        <main class={mainClass}>
          {children}
        </main>
        <script dangerouslySetInnerHTML={{ __html: `
          lucide.createIcons();
          
          // HTMX エラーレスポンス (400, 500等) でもスワップを許可する
          document.addEventListener('htmx:beforeSwap', function(evt) {
            if (evt.detail.xhr.status >= 400 && evt.detail.xhr.status < 600) {
              evt.detail.shouldSwap = true;
              evt.detail.isError = false;

              // レスポンスが JSON の場合、HTMLのアラート通知に変換してスワップさせる
              const contentType = evt.detail.xhr.getResponseHeader("Content-Type");
              if (contentType && contentType.includes("application/json")) {
                try {
                  const responseObj = JSON.parse(evt.detail.xhr.responseText);
                  const errorMsg = responseObj.error?.message || "エラーが発生しました。";
                  const details = responseObj.error?.details ? " : " + responseObj.error.details.join(", ") : "";
                  
                  // serverResponseをHTMLで上書きしてHTMXにスワップさせる
                  evt.detail.serverResponse = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>' + errorMsg + details + '</span></div>';
                } catch (e) {
                  // パース失敗時のフォールバック
                }
              }
            }
          });
          
          document.addEventListener('htmx:afterSwap', function() {
            lucide.createIcons();
          });

          // ログイン失敗を常に可視化するフォールバック
          document.addEventListener('htmx:afterRequest', function(evt) {
            const target = document.getElementById('login-error');
            if (!target) return;
            const status = evt.detail.xhr.status;
            const hasRedirect = evt.detail.xhr.getResponseHeader('HX-Redirect');
            if (status !== 200 && !hasRedirect && target.innerHTML.trim() === '') {
              target.innerHTML = '<div class="alert alert-error rounded-lg flex items-center gap-2"><i data-lucide="alert-circle" class="w-5 h-5"></i><span>\u30ED\u30B0\u30A4\u30F3\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u30B9\u30C6\u30FC\u30BF\u30B9: ' + status + '\uFF09\u3002\u8A8D\u8A3C\u60C5\u5831\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002</span></div>';
              lucide.createIcons();
            }
          });
        ` }} />
      </body>
    </html>
  );
};
