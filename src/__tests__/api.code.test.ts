import { describe, it, expect, vi } from "vitest";
import { createApi, type ApiDeps } from "../http/api";
import { mockConfig, mockPorts } from "./helpers";

function buildDeps(): ApiDeps {
  return {
    ports: mockPorts(),
    config: mockConfig(),
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

    cookieSecure: false,
    registrationEnabled: true,
    githubTokenSet: true,
    triggerHealing: vi.fn().mockResolvedValue({ runId: "run-1" }),
    startedAt: new Date(0).toISOString(),
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
