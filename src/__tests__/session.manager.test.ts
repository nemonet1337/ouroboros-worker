import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodeSessionManager } from "../code/session.manager";
import { NoopRunner } from "../ports/runner";
import type { DbAdapter } from "../ports/db";

describe("CodeSessionManager", () => {
  let mockDb: DbAdapter;
  let runner: NoopRunner;
  let manager: CodeSessionManager;
  let queries: { sql: string; params: any[] }[];

  beforeEach(() => {
    queries = [];
    mockDb = {
      dialect: "sqlite",
      async exec(sql: string, params: any[] = []): Promise<void> {
        queries.push({ sql, params });
      },
      async query<T>(sql: string, params: any[] = []): Promise<T[]> {
        queries.push({ sql, params });
        if (sql.includes("SELECT * FROM code_sessions WHERE id = ?")) {
          return [
            {
              id: params[0],
              user_id: "user-1",
              repo_url: "http://repo",
              branch: "main",
              base_branch: "main",
              title: "Test Session",
              instruction: "do something",
              status: "ready",
              generated_patches: null,
            },
          ] as unknown as T[];
        }
        return [];
      },
      async batch(statements: { sql: string; params?: any[] }[]): Promise<void> {
        for (const stmt of statements) {
          queries.push({ sql: stmt.sql, params: stmt.params ?? [] });
        }
      },
    };

    runner = new NoopRunner();
    manager = new CodeSessionManager(mockDb, runner);
  });

  it("should create session and insert into db", async () => {
    const id = await manager.create({
      userId: "user-1",
      repoUrl: "http://repo",
      branch: "main",
      baseBranch: "main",
      title: "Test Session",
      instruction: "do something",
    });

    expect(id).toBeDefined();
    expect(queries[0].sql).toContain("INSERT INTO code_sessions");
    expect(queries[0].params[0]).toBe(id);
  });

  it("should get session by id", async () => {
    const session = await manager.get("session-123", "user-1");
    expect(session).toBeDefined();
    expect(session?.id).toBe("session-123");
  });

  it("generates directly without a plan phase", async () => {
    const generateSpy = vi.fn().mockResolvedValue({ patches: [{ file: "a.ts" }], model: "m" });
    (runner as any).generate = generateSpy;

    await manager.generate("session-123", "user-1", {
      model: "openai/gpt-6-luna",
      modelOverride: true,
    });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-6-luna",
        instruction: "do something",
      })
    );
    // Plan フェーズ関連の SQL は一切出ない
    expect(queries.some((q) => q.sql.includes("SET plan = ?"))).toBe(false);
    expect(queries.some((q) => q.sql.includes("mode = ?"))).toBe(false);
  });

  it("passes routing config through to the runner and skips Clef when overridden", async () => {
    const generateSpy = vi.fn().mockResolvedValue({ patches: [{ file: "a.ts" }], model: "m" });
    (runner as any).generate = generateSpy;
    const routing = {
      clefModel: "@cf/cloudflare/clef-flash",
      solThreshold: 4,
      efficiencyModel: "openai/gpt-6-luna",
      efficiencyEffort: "low" as const,
      performanceModel: "openai/gpt-6-sol",
      performanceEffort: "medium" as const,
    };

    await manager.generate("session-123", "user-1", { routing });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ routing, modelOverride: false })
    );
  });

  it("persists the route decision returned by the runner", async () => {
    const generateSpy = vi.fn().mockResolvedValue({
      patches: [{ file: "a.ts" }],
      model: "openai/gpt-6-sol",
      route: {
        model: "openai/gpt-6-sol",
        reasoningEffort: "medium",
        difficulty: 4,
        tier: "performance",
        clefAvailable: true,
      },
    });
    (runner as any).generate = generateSpy;

    await manager.generate("session-123", "user-1", {});

    const routeQuery = queries.find((q) => q.sql.includes("difficulty = ?"));
    expect(routeQuery).toBeDefined();
    expect(routeQuery!.params).toContain(4);
    expect(routeQuery!.params).toContain("performance");
    expect(routeQuery!.params).toContain("openai/gpt-6-sol");
  });

  it("stores error_message when runner returns empty patches", async () => {
    const generateSpy = vi.fn().mockResolvedValue({ patches: [], model: "m", error: "empty" });
    (runner as any).generate = generateSpy;

    await manager.generate("session-123", "user-1", { model: "m" });

    const errQuery = queries.find((q) => q.sql.includes("error_message = ?"));
    expect(errQuery).toBeDefined();
    expect(errQuery!.params).toContain("empty");
    expect(errQuery!.params).toContain("failed");
  });
});
