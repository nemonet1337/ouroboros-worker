import { describe, it, expect, beforeEach } from "vitest";
import { CodeSessionRepository, RefactorRepository, type CodeSessionRow, type RefactorProposalRow } from "../db/repositories";
import type { DbAdapter } from "../ports/db";

function createMockDb(): { db: DbAdapter; queries: { sql: string; params: any[] }[] } {
  const queries: { sql: string; params: any[] }[] = [];
  const db: DbAdapter = {
    dialect: "sqlite",
    async exec(sql: string, params: any[] = []): Promise<void> {
      queries.push({ sql, params });
    },
    async query<T>(sql: string, params: any[] = []): Promise<T[]> {
      queries.push({ sql, params });
      if (sql.includes("SELECT * FROM code_sessions WHERE id = ?")) {
        if (params[0] === "session-1" && params[1] === "user-1") {
          return [{ id: "session-1", user_id: "user-1", repo_url: "http://repo", branch: "main", base_branch: "main", title: "Test", instruction: "fix", status: "ready", generated_patches: null, applied_branch: null, pr_number: null, pr_url: null, created_at: 1000, updated_at: 1000 }] as unknown as T[];
        }
        return [];
      }
      if (sql.includes("SELECT * FROM code_sessions WHERE user_id = ?")) {
        return [{ id: "session-1", user_id: "user-1", repo_url: "http://repo", branch: "main", base_branch: "main", title: "Test", instruction: "fix", status: "ready", generated_patches: null, applied_branch: null, pr_number: null, pr_url: null, created_at: 1000, updated_at: 1000 }] as unknown as T[];
      }
      if (sql.includes("FROM inspections WHERE user_id = ? AND status IN")) {
        return [{ id: "insp-1", status: "proposed", created_at: 1000, result: "{}" }] as unknown as T[];
      }
      if (sql.includes("FROM inspections WHERE id = ? AND user_id = ?")) {
        if (params[0] === "insp-1" && params[1] === "user-1") {
          return [{ id: "insp-1", status: "proposed", created_at: 1000, result: "{}" }] as unknown as T[];
        }
        return [];
      }
      return [];
    },
    async batch(statements: { sql: string; params?: any[] }[]): Promise<void> {
      for (const stmt of statements) {
        queries.push({ sql: stmt.sql, params: stmt.params ?? [] });
      }
    },
  };
  return { db, queries };
}

describe("CodeSessionRepository", () => {
  let repo: CodeSessionRepository;
  let queries: { sql: string; params: any[] }[];

  beforeEach(() => {
    const mock = createMockDb();
    queries = mock.queries;
    repo = new CodeSessionRepository(mock.db);
  });

  const makeRow = (overrides: Partial<CodeSessionRow> = {}): CodeSessionRow => ({
    id: "session-1",
    user_id: "user-1",
    repo_url: "http://repo",
    branch: "main",
    base_branch: "main",
    title: "Test Session",
    instruction: "fix stuff",
    status: "initializing",
    generated_patches: null,
    applied_branch: null,
    pr_number: null,
    pr_url: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  });

  it("should create a session row", async () => {
    const row = makeRow();
    await repo.create(row);
    expect(queries.length).toBe(1);
    expect(queries[0].sql).toContain("INSERT INTO code_sessions");
    expect(queries[0].params[0]).toBe("session-1");
    expect(queries[0].params[1]).toBe("user-1");
  });

  it("should get a session by id and userId", async () => {
    const row = await repo.get("session-1", "user-1");
    expect(row).toBeDefined();
    expect(row!.id).toBe("session-1");
    expect(queries.length).toBe(1);
    expect(queries[0].sql).toContain("SELECT * FROM code_sessions WHERE id = ?");
  });

  it("should return undefined for missing session", async () => {
    const row = await repo.get("missing", "user-1");
    expect(row).toBeUndefined();
  });

  it("should list sessions by user", async () => {
    const rows = await repo.listByUser("user-1");
    expect(rows.length).toBe(1);
    expect(queries[0].sql).toContain("ORDER BY created_at DESC");
  });

  it("should update session status", async () => {
    await repo.updateStatus("session-1", "user-1", "generated");
    expect(queries[0].sql).toContain("UPDATE code_sessions SET status = ?");
    expect(queries[0].params[0]).toBe("generated");
  });

  it("should set patches on a session", async () => {
    await repo.setPatches("session-1", "user-1", [{ file: "a.ts", patch: "..." }]);
    expect(queries[0].sql).toContain("SET generated_patches = ?");
    expect(queries[0].params[0]).toBe(JSON.stringify([{ file: "a.ts", patch: "..." }]));
    expect(queries[0].params[1]).toBe("generated");
  });

  it("should set applied state with branch and PR info", async () => {
    await repo.setApplied("session-1", "user-1", "fix-branch", 42, "http://pr");
    expect(queries[0].params[0]).toBe("applied");
    expect(queries[0].params[1]).toBe("fix-branch");
    expect(queries[0].params[2]).toBe(42);
  });

  it("should dismiss a session", async () => {
    await repo.dismiss("session-1", "user-1");
    expect(queries[0].params[0]).toBe("dismissed");
  });
});

describe("RefactorRepository", () => {
  let repo: RefactorRepository;
  let queries: { sql: string; params: any[] }[];

  beforeEach(() => {
    const mock = createMockDb();
    queries = mock.queries;
    repo = new RefactorRepository(mock.db);
  });

  it("should list proposals by user", async () => {
    const rows = await repo.listProposals("user-1");
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("proposed");
    expect(queries[0].sql).toContain("FROM inspections WHERE user_id = ? AND status IN");
  });

  it("should get a proposal by id and userId", async () => {
    const row = await repo.getProposal("insp-1", "user-1");
    expect(row).toBeDefined();
    expect(row!.id).toBe("insp-1");
  });

  it("should return undefined for missing proposal", async () => {
    const row = await repo.getProposal("missing", "user-1");
    expect(row).toBeUndefined();
  });

  it("should update proposal status", async () => {
    await repo.updateStatus("insp-1", "user-1", "applied");
    expect(queries[0].sql).toContain("UPDATE inspections SET status = ?");
    expect(queries[0].params[0]).toBe("applied");
  });

  it("should update proposal result", async () => {
    await repo.updateResult("insp-1", "user-1", '{"score":100}');
    expect(queries[0].params[0]).toBe('{"score":100}');
  });
});
