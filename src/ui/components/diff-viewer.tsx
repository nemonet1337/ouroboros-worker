import type { FC } from "hono/jsx";

interface DiffFile {
  path: string;
  diff: string;
}

interface DiffViewerProps {
  files: DiffFile[];
}

export const DiffViewer: FC<DiffViewerProps> = ({ files }) => {
  return (
    <div class="space-y-4">
      <h2 class="text-xl font-bold">Changes</h2>
      <div class="tabs tabs-bordered">
        {files.map((f, i) => (
          <a key={f.path} class={`tab ${i === 0 ? "tab-active" : ""}`}>{f.path}</a>
        ))}
      </div>
      {files.map((f, i) => (
        <div key={f.path} class={`overflow-x-auto ${i === 0 ? "" : "hidden"}`}>
          <pre class="bg-base-200 p-4 rounded-box text-sm overflow-x-auto">
            <code class="diff">{f.diff}</code>
          </pre>
        </div>
      ))}
    </div>
  );
};
