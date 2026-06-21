import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface SettingsPageProps {
  user?: AuthedUser;
}

export const SettingsPage: FC<SettingsPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">Settings</h1>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Profile</h2>
          <form
            hx-put="/api/v1/auth/me"
            hx-target="#profile-result"
            hx-swap="innerHTML"
          >
            <div class="form-control mb-4">
              <label class="label" for="email">
                <span class="label-text">Email</span>
              </label>
              <input
                type="email"
                name="email"
                id="email"
                placeholder={user?.email || "you@example.com"}
                class="input input-bordered w-full"
                required
              />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="password">
                <span class="label-text">New Password</span>
              </label>
              <input
                type="password"
                name="password"
                id="password"
                placeholder="Leave empty to keep"
                class="input input-bordered w-full"
                minlength={8}
              />
            </div>
            <div class="form-control">
              <button type="submit" class="btn btn-primary">
                Update Profile
              </button>
            </div>
          </form>
          <div id="profile-result" class="mt-4"></div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">AI Model</h2>
          <div
            hx-get="/api/v1/models"
            hx-trigger="load"
            hx-target="#models-list"
            hx-swap="innerHTML"
          >
            <div id="models-list">
              <div class="skeleton h-32 w-full"></div>
            </div>
          </div>
          <div
            hx-get="/api/v1/settings/model"
            hx-trigger="load"
            hx-target="#model-settings"
            hx-swap="innerHTML"
          >
            <div id="model-settings">
              <div class="skeleton h-12 w-full mt-4"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Advanced Settings</h2>
          <div
            hx-get="/api/v1/settings"
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
