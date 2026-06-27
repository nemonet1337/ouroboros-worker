import type { FC } from "hono/jsx";

interface DiffFile {
  path: string;
  diff: string;
}

interface DiffViewerProps {
  files: DiffFile[];
}

export const DiffViewer: FC<DiffViewerProps> = ({ files }) => {
  if (!files || files.length === 0) {
    return (
      <div class="card card-glass p-8 text-center text-base-content/50">
        <i data-lucide="file-text" class="w-12 h-12 mx-auto text-base-content/30 mb-3" />
        <p class="font-bold">差分はありません</p>
        <p class="text-xs opacity-75 mt-1">変更されたファイルはありません。</p>
      </div>
    );
  }

  // 差分テキストを行ごとにパース・色付けする関数
  const highlightDiff = (diffText: string) => {
    return diffText.split('\n').map((line, idx) => {
      let lineClass = "text-base-content/75";
      let bgClass = "";
      if (line.startsWith("+")) {
        lineClass = "text-emerald-400 font-medium";
        bgClass = "bg-emerald-500/10 border-l-2 border-l-emerald-500";
      } else if (line.startsWith("-")) {
        lineClass = "text-rose-400 font-medium";
        bgClass = "bg-rose-500/10 border-l-2 border-l-rose-500";
      } else if (line.startsWith("@@")) {
        lineClass = "text-sky-400 font-semibold";
        bgClass = "bg-sky-500/5";
      } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
        lineClass = "text-base-content/50 italic";
        bgClass = "bg-base-200/30";
      }
      return (
        <div key={idx} class={`px-4 py-0.5 font-mono text-xs leading-5 ${bgClass} ${lineClass} whitespace-pre-wrap break-all`}>
          {line}
        </div>
      );
    });
  };

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-2 mb-2">
        <i data-lucide="file-code" class="w-5 h-5 text-primary" />
        <h3 class="text-lg font-bold text-base-content">変更差分ファイル</h3>
      </div>
      
      {/* タブナビゲーション */}
      <div class="tabs tabs-boxed bg-base-200/50 p-1 rounded-xl gap-1">
        {files.map((f, i) => (
          <button 
            key={f.path} 
            type="button"
            class={`diff-tab tab rounded-lg text-xs font-semibold px-4 py-2 transition-all ${i === 0 ? "tab-active bg-primary text-primary-content" : "hover:bg-base-200"}`}
          >
            {f.path.split('/').pop() || f.path}
          </button>
        ))}
      </div>
      
      {/* ファイル差分表示パネル */}
      <div class="card card-glass overflow-hidden shadow-inner bg-base-300/40">
        {files.map((f, i) => (
          <div 
            key={f.path} 
            class={`diff-panel ${i === 0 ? "" : "hidden"}`}
          >
            {/* ファイルパスヘッダー */}
            <div class="bg-base-200/80 px-4 py-2.5 border-b border-[var(--glass-border)] flex items-center justify-between text-xs opacity-75">
              <span class="font-mono">{f.path}</span>
              <span class="badge badge-sm badge-outline font-semibold">Diff</span>
            </div>
            
            {/* 行パース付き差分表示 */}
            <pre class="bg-transparent py-3 overflow-x-auto select-text">
              <code>{highlightDiff(f.diff)}</code>
            </pre>
          </div>
        ))}
      </div>

      {/* タブ切り替え用のクライアントスクリプト */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          const tabs = document.querySelectorAll('.diff-tab');
          const panels = document.querySelectorAll('.diff-panel');
          tabs.forEach((tab, index) => {
            tab.addEventListener('click', (e) => {
              e.preventDefault();
              tabs.forEach(t => {
                t.classList.remove('tab-active', 'bg-primary', 'text-primary-content');
                t.classList.add('hover:bg-base-200');
              });
              panels.forEach(p => p.classList.add('hidden'));
              
              tab.classList.add('tab-active', 'bg-primary', 'text-primary-content');
              tab.classList.remove('hover:bg-base-200');
              panels[index].classList.remove('hidden');
            });
          });
        })();
      ` }} />
    </div>
  );
};
export { DiffFile, DiffViewerProps };
