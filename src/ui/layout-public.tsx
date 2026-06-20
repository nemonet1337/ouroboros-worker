import type { FC, PropsWithChildren } from "hono/jsx";

export interface LayoutPublicProps {
  title?: string;
}

export const LayoutPublic: FC<PropsWithChildren<LayoutPublicProps>> = ({ title = "Ouroboros", children }) => {
  return (
    <html lang="ja" data-theme="night">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} - Ouroboros</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@5.0.0-beta.2/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://unpkg.com/htmx.org@2.0.8"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <style>{`body { font-family: system-ui, -apple-system, sans-serif; }`}</style>
      </head>
      <body class="min-h-screen bg-base-300">
        <main class="flex-1 p-4 md:p-6 max-w-md mx-auto w-full">
          {children}
        </main>
        <script dangerouslySetInnerHTML={{ __html: `lucide.createIcons();` }} />
      </body>
    </html>
  );
};
