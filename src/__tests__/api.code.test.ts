import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createApi, type ApiDeps } from "../http/api";
import { mockAi } from "./helpers";
import { NoopRunner } from "../ports/runner";
import type { DbAdapter } from "../ports/db";

function mockDb(): DbAdapter {
  return {
    dialect: "sqlite",
    exec: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    batch: vi.fn(),
  };
}

function buildDeps(): ApiDeps {
  const db = mockDb();
  return {
    ports: {
      db,
      ai: mockAi(""),
      vcs: {
        name: "github",
        createPR: vi.fn(),
        listOpenPRs: vi.fn().mockResolvedValue([]),
        getPRChecks: vi.fn(),
        listPRFiles: vi.fn().mockResolvedValue([]),
        mergePR: vi.fn().mockResolvedValue(true),
        deleteBranch: vi.fn(),
        createIssue: vi.fn(),
        listIssues: vi.fn().mockResolvedValue([]),
        updateIssue: vi.fn(),
        listRepos: vi.fn().mockResolvedValue([]),
        listBranches: vi.fn().mockResolvedValue([]),
      },
      logs: { kind: "r2" as const, append: vi.fn(), read: vi.fn(), list: vi.fn().mockResolvedValue([]) },
      queue: { kind: "cf-queue" as const, send: vi.fn() },
      mailer: { kind: "cf-email" as const, send: vi.fn() },
      runner: new NoopRunner(),
      codeRunner: new NoopRunner(),
      rateLimiter: { kind: "cf" as const, limit: vi.fn().mockResolvedValue({ success: true }) },
      vectorize: undefined,
    },
    config: {
      ai: { model: "minimax/m3", maxRetries: 3, contextLines: 20 },
      targets: {} as any,
      vcs: { owner: "test", repo: "test", baseBranch: "main", branchPrefix: "ouro-fix" },
      notifications: {},
      autoMerge: { enabled: false, requireCIPass: false },
      dryRun: false,
      scan: { maxPRsPerRun: 5, secretScanEnabled: true, licenseCheckEnabled: true },
    },
    auth: {
      resolveSession: vi.fn().mockResolvedValue({ id: "user-1", email: "test@test.com", role: "admin" }),
      userCount: vi.fn().mockResolvedValue(1),
      userCreate: vi.fn(),
      userLookUp: vi.fn(),
      userUpdate: vi.fn().mockResolvedValue(1),
      listUsers: vi.fn().mockResolvedValue([]),
      cleanupExpiredSessions: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      isRegistrationEnabled: vi.fn().mockResolvedValue(true),
    } as any,
    logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) } as any,
    deployTarget: "cloudflare",
    cookieSecure: false,
    registrationEnabled: true,
    githubTokenSet: true,
    triggerHealing: vi.fn().mockResolvedValue({ runId: "run-1" }),
    versionMetadata: undefined,
  };
}

describe("API Code Mode", () => {
  it("should list code sessions with valid auth cookie", async () => {
    const deps = buildDeps();
    const api = createApi(deps);
    const res = await api.request("/code/sessions", {
      headers: { cookie: "ouro_session=valid-session-id" },
    });
    expect(res.status).toBe(200);
  });

  it("should return 401 without auth cookie", async () => {
    const deps = buildDeps();
    const api = createApi(deps);
    const res = await api.request("/code/sessions");
    expect(res.status).toBe(401);
  });

  it("should return 404 for non-existent session", async () => {
    const deps = buildDeps();
    const api = createApi(deps);
    const res = await api.request("/code/sessions/non-existent", {
      headers: { cookie: "ouro_session=valid-session-id" },
    });
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});
