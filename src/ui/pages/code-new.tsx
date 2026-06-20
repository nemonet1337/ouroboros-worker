import type { FC } from "hono/jsx";
import { Layout } from "../layout";

export const CodeNewPage: FC = () => {
  return (
    <Layout>
      <h1 class="text-3xl font-bold mb-6">Create Code Session</h1>
      <div class="card bg-base-100 shadow-lg">
        <div class="card-body">
          <form hx-post="/api/v1/code/sessions" hx-target="this" hx-swap="outerHTML">
            <div class="form-control mb-4">
              <label class="label" for="repoUrl"><span class="label-text">Repository URL</span></label>
              <input type="url" name="repoUrl" id="repoUrl" placeholder="https://github.com/owner/repo" class="input input-bordered w-full" required />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="title"><span class="label-text">Title</span></label>
              <input type="text" name="title" id="title" placeholder="Fix login bug" class="input input-bordered w-full" required />
            </div>
            <div class="form-control mb-4">
              <label class="label" for="instruction"><span class="label-text">Instruction</span></label>
              <textarea name="instruction" id="instruction" class="textarea textarea-bordered w-full" rows={4} required></textarea>
            </div>
            <div class="form-control" hidden>
              <button type="submit" class="btn btn-primary w-full">Create</button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};
