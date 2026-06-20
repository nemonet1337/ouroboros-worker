import type { FC } from "hono/jsx";

interface DependencyChange {
  name: string;
  current: string;
  latest: string;
  updateType: "major" | "minor" | "patch";
  breaking: boolean;
}

interface DependencyChangesProps {
  changes: DependencyChange[];
}

export const DependencyChanges: FC<DependencyChangesProps> = ({ changes }) => {
  return (
    <div class="overflow-x-auto">
      <table class="table table-zebra">
        <thead>
          <tr>
            <th>Package</th>
            <th>Current</th>
            <th>Latest</th>
            <th>Type</th>
            <th>Breaking</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((d) => (
            <tr key={d.name}>
              <td class="font-mono font-bold">{d.name}</td>
              <td class="font-mono text-error">{d.current}</td>
              <td class="font-mono text-success">{d.latest}</td>
              <td>
                <span
                  class={`badge ${
                    d.updateType === "major"
                      ? "badge-error"
                      : d.updateType === "minor"
                        ? "badge-warning"
                        : "badge-info"
                  }`}
                >
                  {d.updateType}
                </span>
              </td>
              <td>{d.breaking ? <span class="badge badge-error">Yes</span> : <span class="badge badge-ghost">No</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {changes.length === 0 && <div class="text-center py-8 opacity-60">No dependency updates available</div>}
    </div>
  );
};
