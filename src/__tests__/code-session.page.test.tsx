/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { CodeSessionPage } from "../ui/pages/code-session";
import type { CodeSessionRow, HarnessTrace } from "../types";

const session: CodeSessionRow = {
  id: "sess-1",
  user_id: "user-1",
  repo_url: "https://github.com/acme/app",
  branch: "main",
  base_branch: "main",
  title: "Fix login",
  instruction: "do it",
  status: "generated",
  generated_patches: JSON.stringify([{ file: "src/a.ts", explanation: "inc", diff: "" }]),
  applied_branch: null,
  pr_number: null,
  pr_url: null,
  created_at: 1,
  updated_at: 1,
};

const trace: HarnessTrace = {
  selectedPaths: ["src/a.ts", "src/a.test.ts"],
  source: "vectorize",
  snippetCount: 3,
  verifyErrors: [],
  verifyWarnings: ["minor"],
  repairAttempts: 1,
};

describe("CodeSessionPage harness trace", () => {
  it("renders retrieved files, source, and repair count", async () => {
    const app = new Hono();
    app.get("/code/sessions/:id", (c) =>
      c.html(
        <CodeSessionPage sessionId="sess-1" session={session} harnessTrace={trace} />
      )
    );
    const html = await (await app.request("/code/sessions/sess-1")).text();
    expect(html).toContain("コーディングハーネス");
    expect(html).toContain("src/a.ts");
    expect(html).toContain("src/a.test.ts");
    expect(html).toContain("vectorize");
    expect(html).toContain("repair 1");
    expect(html).toContain("minor");
  });

  it("omits the harness panel when there is no trace", async () => {
    const app = new Hono();
    app.get("/code/sessions/:id", (c) =>
      c.html(<CodeSessionPage sessionId="sess-1" session={session} />)
    );
    const html = await (await app.request("/code/sessions/sess-1")).text();
    expect(html).not.toContain("コーディングハーネス");
  });
});
