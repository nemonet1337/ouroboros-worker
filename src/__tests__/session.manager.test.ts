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

  it("generates plan first and passes plan-augmented instruction with the coding model", async () => {
    const generateSpy = vi.fn().mockResolvedValue({ patches: [{ file: "a.ts" }], model: "m" });
    (runner as any).generate = generateSpy;
    const ai = {
      name: "mock",
      complete: vi.fn().mockResolvedValue("1. まずAを直す\n2. 次にBを直す"),
    };
    manager = new CodeSessionManager(mockDb, runner, ai as any);

    await manager.generate("session-123", "user-1", {
      model: "@cf/meta/llama-3.1-8b-instruct",
      planModel: "minimax/m3",
    });

    // Plan フェーズは planModel で呼ばれる
    expect(ai.complete).toHaveBeenCalledWith(
      expect.objectContaining({ model: "minimax/m3" })
    );
    // Plan は code_sessions.plan に保存される
    expect(queries.some((q) => q.sql.includes("SET plan = ?"))).toBe(true);
    // 生成は coding モデル + 計画付き instruction で呼ばれる
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "@cf/meta/llama-3.1-8b-instruct",
        instruction: expect.stringContaining("## 実装計画"),
      })
    );
  });

  it("still generates when the plan phase fails", async () => {
    const generateSpy = vi.fn().mockResolvedValue({ patches: [{ file: "a.ts" }], model: "m" });
    (runner as any).generate = generateSpy;
    const ai = {
      name: "mock",
      complete: vi.fn().mockRejectedValue(new Error("plan model down")),
    };
    manager = new CodeSessionManager(mockDb, runner, ai as any);

    await manager.generate("session-123", "user-1", { model: "m", planModel: "p/m" });

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: "do something" })
    );
  });
});
