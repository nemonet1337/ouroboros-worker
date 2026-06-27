import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock cloudflare:workers module
vi.mock("cloudflare:workers", () => {
  return {
    WorkerEntrypoint: class {
      declare env: any;
      declare ctx: any;
      constructor(ctx: any, env: any) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  };
});

import RunnerWorker from "../index";

function createMockEnv(overrides: Record<string, unknown> = {}): any {
  return {
    RUNNER_SHARED_SECRET: undefined,
    GITHUB_REPOSITORY: "",
    GITHUB_TOKEN_SECRET: {
      get: vi.fn().mockResolvedValue("gh-token"),
    },
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockReturnValue({ results: [] }),
        run: vi.fn().mockResolvedValue({}),
      }),
    },
    AI: {
      run: vi.fn().mockResolvedValue({ response: "fixed content" }),
    },
    ...overrides,
  };
}

function createWorker(envOverrides: Record<string, unknown> = {}) {
  const env = createMockEnv(envOverrides);
  return new RunnerWorker({} as any, env);
}

describe("RunnerWorker fetch router", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return 405 for non-POST methods", async () => {
    const worker = createWorker();
    const res = await worker.fetch(new Request("http://internal/internal/scan", { method: "GET" }));
    expect(res.status).toBe(405);
  });

  it("should return 404 for unknown paths", async () => {
    const worker = createWorker();
    const res = await worker.fetch(new Request("http://internal/internal/unknown", { method: "POST" }));
    expect(res.status).toBe(404);
  });

  it("should return 401 when secret is required but missing", async () => {
    const worker = createWorker({ RUNNER_SHARED_SECRET: "super-secret" });
    const res = await worker.fetch(
      new Request("http://internal/internal/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    expect(res.status).toBe(401);
  });

  it("should return 200 when secret is correct", async () => {
    const worker = createWorker({ RUNNER_SHARED_SECRET: "super-secret", GITHUB_REPOSITORY: "owner/repo" });
    vi.mocked(globalThis.fetch).mockImplementation((input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/repos/owner/repo") && !url.includes("/git/") && !url.includes("/contents/")) {
        return Promise.resolve(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }));
      }
      if (url.includes("/git/refs/heads/")) {
        return Promise.resolve(new Response(JSON.stringify({ object: { sha: "abc123" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ sha: "abc123", tree: [], truncated: false }), { status: 200 }));
    });
    const res = await worker.fetch(
      new Request("http://internal/internal/scan", {
        method: "POST",
        headers: { "content-type": "application/json", "x-runner-secret": "super-secret" },
        body: "{}",
      })
    );
    expect(res.status).toBe(200);
  });

  it("should accept scan request without secret when not configured", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/heal to applyFix", async () => {
    const worker = createWorker({ GITHUB_REPOSITORY: "owner/repo" });
    vi.mocked(globalThis.fetch).mockImplementation((input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/repos/owner/repo") && !url.includes("/git/") && !url.includes("/contents/")) {
        return Promise.resolve(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }));
      }
      if (url.includes("/git/refs/heads/")) {
        return Promise.resolve(new Response(JSON.stringify({ object: { sha: "abc123" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ sha: "abc123", tree: [], truncated: false }), { status: 200 }));
    });
    const res = await worker.fetch(
      new Request("http://internal/internal/heal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          group: { id: "g1", findings: [] },
          dryRun: true,
          baseBranch: "main",
          branchPrefix: "ouro",
        }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/init to codeInit", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-1",
          repoUrl: "repo",
          branch: "main",
        }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/status to codeStatus", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-1" }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/read to codeRead", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-1", paths: ["a.ts"] }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/write to codeWrite", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-1",
          files: [{ path: "a.ts", content: "code" }],
        }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/delete to codeDelete", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-1", paths: ["a.ts"] }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/commit to codeCommit", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-1", message: "fix" }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/push to codePush", async () => {
    const worker = createWorker();
    const res = await worker.fetch(
      new Request("http://internal/internal/code/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "sess-1", branch: "fix-branch" }),
      })
    );
    expect(res.status).toBe(200);
  });

  it("should route /internal/code/generate to codeGenerate", async () => {
    const worker = createWorker({
      GITHUB_REPOSITORY: "owner/repo",
      OURO_CODE_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    });
    vi.mocked(globalThis.fetch).mockImplementation((input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/repos/owner/repo") && !url.includes("/git/")) {
        return Promise.resolve(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }));
      }
      if (url.includes("/git/refs/heads/")) {
        return Promise.resolve(new Response(JSON.stringify({ object: { sha: "abc123" } }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ sha: "abc123", tree: [], truncated: false }), { status: 200 }));
    });
    const res = await worker.fetch(
      new Request("http://internal/internal/code/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: "sess-1",
          instruction: "fix the code",
          model: "@cf/meta/llama-3.1-8b-instruct",
        }),
      })
    );
    expect(res.status).toBe(200);
  });
});
