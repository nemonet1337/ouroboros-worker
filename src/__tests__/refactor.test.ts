import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProposalManager } from "../refactor/proposal.manager";
import { mockAi } from "./helpers";
import { NoopRunner } from "../ports/runner";
import type { DbAdapter } from "../ports/db";
import type { VcsProvider } from "../ports/vcs";

describe("ProposalManager", () => {
  let mockDb: DbAdapter;
  let mockVcs: VcsProvider;
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
        if (sql.includes("SELECT * FROM inspections WHERE id = ?")) {
          return [
            {
              id: "inspection-123",
              user_id: "user-1",
              result: JSON.stringify({
                findings: [],
                proposal: { summary: "refactor print", priority: "high" },
              }),
              status: "proposed",
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

    mockVcs = {
      name: "github",
      createPR: vi.fn().mockResolvedValue({ number: 42, url: "http://pr-42" }),
      listOpenPRs: vi.fn(),
      getPRChecks: vi.fn(),
      listPRFiles: vi.fn(),
      mergePR: vi.fn(),
      deleteBranch: vi.fn(),
      createIssue: vi.fn(),
      listIssues: vi.fn(),
      updateIssue: vi.fn(),
    };
  });

  it("should generate proposal and update inspection status", async () => {
    const aiResponse = JSON.stringify({
      summary: "Refactor database access",
      priority: "high",
    });
    const manager = new ProposalManager(mockAi(aiResponse), mockDb, mockVcs);

    await manager.generateProposal("inspection-123", "user-1");

    const updateQuery = queries.find((q) => q.sql.includes("UPDATE inspections SET status = ?"));
    expect(updateQuery).toBeDefined();
    expect(updateQuery?.params[0]).toBe("proposed");
    expect(updateQuery?.params[1]).toContain("Refactor database access");
  });

  it("should apply proposal and create PR", async () => {
    const aiResponse = JSON.stringify({
      patches: [
        {
          file: "src/db.ts",
          fixedContent: "const db = null;",
        },
      ],
    });
    const runner = new NoopRunner();
    runner.commit = vi.fn().mockResolvedValue({ success: true, commitHash: "abc" });
    runner.push = vi.fn().mockResolvedValue({ success: true });

    const manager = new ProposalManager(mockAi(aiResponse), mockDb, mockVcs, "http://repo");
    const result = await manager.applyProposal("inspection-123", "user-1", runner);

    expect(result.prNumber).toBe(42);
    expect(result.prUrl).toBe("http://pr-42");
    expect(mockVcs.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        branch: expect.stringContaining("refactor/"),
        baseBranch: "main",
      })
    );
  });

  it("should dismiss proposal", async () => {
    const manager = new ProposalManager(mockAi(""), mockDb, mockVcs);
    await manager.dismissProposal("inspection-123", "user-1");

    const updateQuery = queries.find((q) => q.sql.includes("UPDATE inspections SET status = ?"));
    expect(updateQuery).toBeDefined();
    expect(updateQuery?.params[0]).toBe("dismissed");
  });
});
