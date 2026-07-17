import { describe, it, expect, vi } from "vitest";
import { createFragments, type FragmentDeps } from "../ui/fragments";
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

function buildDeps(overrides: Partial<FragmentDeps> = {}): FragmentDeps {
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
      logs: { kind: "r2" as const, append: vi.fn(), read: vi.fn().mockResolvedValue("log line"), list: vi.fn().mockResolvedValue(["ouroboros.log"]) },
      queue: { kind: "cf-queue" as const, send: vi.fn() },
      mailer: { kind: "cf-email" as const, send: vi.fn() },
      runner: new NoopRunner(),
      codeRunner: new NoopRunner(),
      rateLimiter: { kind: "cf" as const, limit: vi.fn().mockResolvedValue({ success: true }) },
      vectorize: undefined,
    } as any,
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
      resolveSession: vi.fn().mockResolvedValue({ id: "user-1", email: "test@test.com", role: "admin", model: null }),
      userCount: vi.fn().mockResolvedValue(1),
      isRegistrationEnabled: vi.fn().mockResolvedValue(true),
      setRegistrationEnabled: vi.fn(),
      listTokens: vi.fn().mockResolvedValue([]),
      createToken: vi.fn().mockResolvedValue({ secret: "ouro_secret123", prefix: "ouro_sec", id: "tok-1" }),
      revokeToken: vi.fn(),
      resolveModel: vi.fn().mockResolvedValue("minimax/m3"),
      updateProfile: vi.fn().mockResolvedValue({ id: "user-1", email: "new@test.com", role: "admin", model: null }),
    } as any,
    logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) } as any,
    githubTokenSet: true,
    triggerHealing: vi.fn().mockResolvedValue({ runId: "run-12345678" }),
    ...overrides,
  };
}

const authed = { headers: { cookie: "ouro_session=valid-session-id" } };

describe("UI fragments", () => {
  it.each([
    ["/metrics"],
    ["/prs?page=1"],
    ["/history"],
    ["/code/sessions"],
    ["/refactor/proposals"],
    ["/webhooks"],
    ["/tokens"],
    ["/healing/runs"],
  ])("GET %s returns HTML (not raw JSON) for an authed session", async (path) => {
    const app = createFragments(buildDeps());
    const res = await app.request(path, authed);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body.trim().startsWith("{")).toBe(false);
    expect(body).toContain("<");
  });

  it("renders Japanese empty states instead of empty JSON", async () => {
    const app = createFragments(buildDeps());
    const cases: Array<[string, string]> = [
      ["/code/sessions", "セッションはありません"],
      ["/refactor/proposals", "リファクタリング提案はまだありません"],
      ["/webhooks", "登録済みの Webhook はありません"],
      ["/tokens", "有効なトークンはありません"],
      ["/healing/runs", "修復実行履歴はありません"],
      ["/history", "スキャン履歴はありません"],
    ];
    for (const [path, text] of cases) {
      const res = await app.request(path, authed);
      expect(await res.text()).toContain(text);
    }
  });

  it("returns 401 with HX-Redirect to /login when no session cookie is sent", async () => {
    const deps = buildDeps();
    (deps.auth.resolveSession as any) = vi.fn().mockResolvedValue(undefined);
    const app = createFragments(deps);
    const res = await app.request("/metrics");
    expect(res.status).toBe(401);
    expect(res.headers.get("HX-Redirect")).toBe("/login");
  });

  it("returns a 403 error alert (HTML) for admin fragments as a non-admin user", async () => {
    const deps = buildDeps();
    (deps.auth.resolveSession as any) = vi
      .fn()
      .mockResolvedValue({ id: "user-2", email: "member@test.com", role: "member", model: null });
    const app = createFragments(deps);
    for (const path of ["/admin/registration", "/admin/logs", "/admin/config"]) {
      const res = await app.request(path, authed);
      expect(res.status).toBe(403);
      expect(await res.text()).toContain("管理者権限が必要です");
    }
  });

  it("renders admin fragments for an admin user", async () => {
    const app = createFragments(buildDeps());
    const logs = await app.request("/admin/logs", authed);
    expect(logs.status).toBe(200);
    expect(await logs.text()).toContain("ouroboros.log");

    const config = await app.request("/admin/config", authed);
    expect(config.status).toBe(200);
    expect(await config.text()).toContain("test/test");

    const registration = await app.request("/admin/registration", authed);
    expect(registration.status).toBe(200);
    expect(await registration.text()).toContain("新規登録を受け付ける");
  });

  it("returns an info alert when a feature flag disables the widget", async () => {
    const deps = buildDeps({
      flags: { get: vi.fn().mockResolvedValue(false) } as any,
    });
    const app = createFragments(deps);
    const res = await app.request("/code/sessions", authed);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("この機能は現在無効化されています");
  });

  it("creates a token from form data and shows the secret once", async () => {
    const deps = buildDeps();
    const app = createFragments(deps);
    const form = new URLSearchParams();
    form.set("name", "github-actions-ci");
    form.append("scopes", "read");
    form.append("scopes", "inspect");
    form.set("expiresInDays", "30");
    const res = await app.request("/tokens", {
      method: "POST",
      headers: { ...authed.headers, "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("ouro_secret123");
    expect(body).toContain("トークンを生成しました");
    expect(deps.auth.createToken).toHaveBeenCalledWith("user-1", "github-actions-ci", ["read", "inspect"], 30);
  });

  it("triggers healing with dryRun parsed from the form value", async () => {
    const deps = buildDeps();
    const app = createFragments(deps);
    const res = await app.request("/healing", {
      method: "POST",
      headers: { ...authed.headers, "content-type": "application/x-www-form-urlencoded" },
      body: "dryRun=true",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("ドライラン");
    expect(deps.triggerHealing).toHaveBeenCalledWith({ trigger: "gui", userId: "user-1", dryRun: true });
  });

  it("converts handler errors into an error alert fragment instead of raw output", async () => {
    const deps = buildDeps();
    (deps.ports.db.query as any) = vi.fn().mockRejectedValue(new Error("boom"));
    const app = createFragments(deps);
    const res = await app.request("/webhooks", authed);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("処理に失敗しました");
  });
});
