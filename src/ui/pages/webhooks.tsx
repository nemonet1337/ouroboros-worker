import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface WebhooksPageProps {
  user?: AuthedUser;
}

export const WebhooksPage: FC<WebhooksPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Webhooks</h1>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Create Webhook</h2>
          <form
            hx-post="/api/v1/webhooks"
            hx-target="this"
            hx-swap="outerHTML"
          >
            <div class="form-control mb-4">
              <label class="label" for="name">
                <span class="label-text">Name</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                placeholder="My Webhook"
                class="input input-bordered w-full"
                required
              />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="url">
                <span class="label-text">URL</span>
              </label>
              <input
                type="url"
                name="url"
                id="url"
                placeholder="https://hooks.slack.com/..."
                class="input input-bordered w-full font-mono"
                required
              />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="adapter">
                <span class="label-text">Adapter</span>
              </label>
              <select name="adapter" id="adapter" class="select select-bordered w-full">
                <option value="generic">Generic</option>
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
                <option value="github">GitHub</option>
              </select>
            </div>
            <div class="form-control mb-4">
              <label class="label cursor-pointer">
                <span class="label-text">Enabled</span>
                <input type="checkbox" name="enabled" class="toggle toggle-primary" checked />
              </label>
            </div>
            <div class="form-control">
              <button type="submit" class="btn btn-primary">
                Create
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Webhook List</h2>
          <div
            hx-get="/api/v1/webhooks"
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
