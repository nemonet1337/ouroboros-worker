import type { FC } from "hono/jsx";
import { LayoutPublic } from "../layout-public";

export const RegisterPage: FC = () => {
  return (
    <LayoutPublic title="Register">
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title justify-center text-2xl mb-4">Create Account</h2>
          <form hx-post="/api/v1/auth/register" hx-target="this" hx-swap="outerHTML">
            <div class="form-control mb-4">
              <label class="label" for="email">
                <span class="label-text">Email</span>
              </label>
              <input
                type="email"
                name="email"
                id="email"
                placeholder="you@example.com"
                class="input input-bordered w-full"
                required
              />
            </div>
            <div class="form-control mb-6">
              <label class="label" for="password">
                <span class="label-text">Password</span>
              </label>
              <input
                type="password"
                name="password"
                id="password"
                placeholder="••••••••"
                class="input input-bordered w-full"
                minlength={8}
                required
              />
            </div>
            <div class="form-control mb-4">
              <button type="submit" class="btn btn-primary w-full">
                Register
              </button>
            </div>
            <div class="text-center text-sm">
              <a href="/login">Already have an account? Login</a>
            </div>
          </form>
        </div>
      </div>
    </LayoutPublic>
  );
};
