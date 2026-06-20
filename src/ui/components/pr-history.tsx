import type { FC } from "hono/jsx";

interface PullRequest {
  number: number;
  title: string;
  branch: string;
  status: "open" | "merged" | "closed";
  created_at: string;
}

interface PRHistoryProps {
  items: PullRequest[];
  page?: number;
  perPage?: number;
}

export const PRHistory: FC<PRHistoryProps> = ({ items, page = 1, perPage = 10 }) => {
  return (
    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Title</th>
            <th>Branch</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {items.map((pr) => (
            <tr key={pr.number}>
              <td class="font-mono">{pr.number}</td>
              <td>{pr.title}</td>
              <td class="font-mono text-xs">{pr.branch}</td>
              <td>
                <span
                  class={`badge badge-sm ${
                    pr.status === "merged"
                      ? "badge-success"
                      : pr.status === "open"
                        ? "badge-info"
                        : "badge-ghost"
                  }`}
                >
                  {pr.status}
                </span>
              </td>
              <td class="text-sm opacity-70">{new Date(pr.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div class="text-center py-8 opacity-60">No PR history yet</div>
      )}

      <div class="flex justify-center gap-2 mt-4">
        <button class="btn btn-sm btn-ghost" disabled={page <= 1}>Previous</button>
        <span class="flex items-center text-sm">Page {page}</span>
        <button class="btn btn-sm btn-ghost" disabled={items.length < perPage}>Next</button>
      </div>
    </div>
  );
};
