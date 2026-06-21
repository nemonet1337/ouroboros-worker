import type { FC } from "hono/jsx";
import type { AuthedUser } from "../../auth/service";
import { Layout } from "../layout";

interface TokensPageProps {
  user?: AuthedUser;
}

export const TokensPage: FC<TokensPageProps> = ({ user }) => {
  return (
    <Layout user={user}>
      <h1 class="text-3xl font-bold mb-6">API Tokens</h1>

      <div class="card bg-base-100 shadow-lg mb-6">
        <div class="card-body">
          <h2 class="card-title">Create Token</h2>
          <form
            hx-post="/api/v1/tokens"
            hx-target="#token-result"
            hx-swap="innerHTML"
          >
            <div class="form-control mb-4">
              <label class="label" for="name">
                <span class="label-text">Name</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                placeholder="ci-token"
                class="input input-bordered w-full"
                required
              />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="scopes">
                <span class="label-text">Scopes</span>
              </label>
              <select name="scopes" id="scopes" class="select select-bordered w-full" multiple>
                <option value="read">read</option>
                <option value="inspect">inspect</option>
                <option value="heal">heal</option>
              </select>
            </div>
            <div class="form-control mb-4">
              <label class="label" for="expiresInDays">
                <span class="label-text">Expires (days)</span>
              </label>
              <input
                type="number"
                name="expiresInDays"
                id="expiresInDays"
                placeholder="30"
                class="input input-bordered w-full"
                min={1}
                max={365}
              />
            </div>
            <div class="form-control">
              <button type="submit" class="btn btn-primary">
                Create Token
              </button>
            </div>
          </form>
          <div id="token-result" class="mt-4"></div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Token List</h2>
          <div
            hx-get="/api/v1/tokens"
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
