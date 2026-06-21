import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";
import { ScoreGauge } from "../components/score-gauge";
import { ScoreBreakdown } from "../components/score-breakdown";
import { FindingsList } from "../components/findings-list";

interface InspectionPageProps {
  user?: AuthedUser;
}

export const InspectionPage: FC<InspectionPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Inspection</h1>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">New Inspection</h2>
          <form
            hx-post="/api/v1/inspect"
            hx-target="#inspect-result"
            hx-swap="innerHTML"
          >
            <div class="form-control mb-4">
              <label class="label" for="language">
                <span class="label-text">Language</span>
              </label>
              <select
                name="language"
                id="language"
                class="select select-bordered w-full"
                required
              >
                <option value="">Select language</option>
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
            <div class="form-control mb-4">
              <label class="label" for="code">
                <span class="label-text">Code</span>
              </label>
              <textarea
                name="code"
                id="code"
                class="textarea textarea-bordered w-full font-mono"
                rows={8}
                placeholder="Paste code to inspect..."
                required
              ></textarea>
            </div>
            <div class="form-control">
              <button type="submit" class="btn btn-primary">
                Inspect
              </button>
            </div>
          </form>
          <div id="inspect-result" class="mt-4"></div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">History</h2>
          <div
            hx-get="/api/v1/history"
            hx-trigger="load"
            hx-target="this"
            hx-swap="innerHTML"
          >
            <div class="skeleton h-64 w-full"></div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
