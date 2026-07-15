import { describe, it, expect, vi } from "vitest";
import { DynamicRunner } from "../adapters/dynamic.runner";
import type { DynamicWorkerCode, DynamicWorkerLoader } from "../env";
import type { DbAdapter } from "../ports/db";

function mockDb(): DbAdapter {
  const store = new Map<string, string>();
  return {
    dialect: "sqlite",
    async query<T>(sql: string, params: any[] = []): Promise<T[]> {
      if (sql.includes("WHERE session_id = ? AND key = ?")) {
        const v = store.get(`${params[0]}:${params[1]}`);
        return v !== undefined ? ([{ value: v }] as any) : [];
      }
      if (sql.includes("key LIKE 'staged:%'")) {
        const rows: any[] = [];
        for (const [k, value] of store) {
          const [sessionId, ...keyParts] = k.split(":");
          const key = keyParts.join(":");
          if (sessionId === params[0] && key.startsWith("staged:")) rows.push({ key, value });
        }
        return rows as any;
      }
      return [];
    },
    async exec(sql: string, params: any[] = []): Promise<void> {
      if (sql.includes("INSERT INTO code_session_cache")) {
        store.set(`${params[0]}:${params[1]}`, String(params[2]));
      } else if (sql.includes("DELETE FROM code_session_cache")) {
        store.delete(`${params[0]}:${params[1]}`);
      }
    },
    async batch(): Promise<void> {},
  };
}

describe("DynamicRunner", () => {
  it("loads a dynamic worker with source module, env bindings, and no globalOutbound", async () => {
    let capturedId = "";
    let capturedCode: DynamicWorkerCode | undefined;
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ staticAnalysis: [], dependency: [], performance: [], secrets: [] }), {
        status: 200,
      })
    );
    const loader: DynamicWorkerLoader = {
      get(id, getCode) {
        capturedId = id;
        const resolved = getCode();
        capturedCode = resolved as DynamicWorkerCode;
        return { getEntrypoint: () => ({ fetch: fetchSpy }) };
      },
    };

    const runner = new DynamicRunner(loader, {
      ai: {} as Ai,
      db: mockDb(),
      githubToken: "gh-token",
      repository: "owner/repo",
      codeModel: "minimax/m3",
    });

    const result = await runner.scan();

    expect(capturedId).toBe("ouroboros-dynamic-runner");
    expect(capturedCode?.mainModule).toBe("runner.js");
    expect(capturedCode?.modules["runner.js"]).toContain("handleScan");
    expect(capturedCode?.env).toMatchObject({
      GITHUB_TOKEN: "gh-token",
      GITHUB_REPOSITORY: "owner/repo",
      OURO_CODE_MODEL: "minimax/m3",
    });
    // globalOutbound を null にすると GitHub API へ到達できなくなるため省略されていること
    expect(capturedCode && "globalOutbound" in capturedCode).toBe(false);

    expect(result.findings.staticAnalysis).toEqual([]);
    const req = fetchSpy.mock.calls[0][0] as Request;
    expect(new URL(req.url).pathname).toBe("/internal/scan");
  });

  it("normalizes legacy scan output from the dynamic worker", async () => {
    const loader: DynamicWorkerLoader = {
      get: () => ({
        getEntrypoint: () => ({
          fetch: async () =>
            new Response(
              JSON.stringify({
                codeql: [
                  { ruleId: "x", severity: "error", message: "m", location: { file: "f.ts", startLine: 3 } },
                ],
              }),
              { status: 200 }
            ),
        }),
      }),
    };
    const runner = new DynamicRunner(loader, {
      ai: {} as Ai,
      db: mockDb(),
      githubToken: "t",
      repository: "o/r",
    });

    const { findings } = await runner.scan();
    expect(findings.staticAnalysis).toHaveLength(1);
    expect(findings.staticAnalysis[0].severity).toBe("high");
    expect(findings.staticAnalysis[0].file).toBe("f.ts");
  });

  it("routes generate to the dynamic worker but handles write/status host-side", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ patches: [], model: "m" }), { status: 200 })
    );
    const loader: DynamicWorkerLoader = {
      get: () => ({ getEntrypoint: () => ({ fetch: fetchSpy }) }),
    };
    const db = mockDb();
    const runner = new DynamicRunner(loader, {
      ai: {} as Ai,
      db,
      githubToken: "t",
      repository: "o/r",
    });

    await runner.generate({ sessionId: "s1", instruction: "do it", model: "m" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // write はホスト側 D1 のみで処理され、動的 Worker は呼ばれない
    const writeResult = await runner.write({
      sessionId: "s1",
      files: [{ path: "a.ts", content: "x" }],
    });
    expect(writeResult.success).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // repoUrl キャッシュを直接セットして status を確認
    await db.exec(
      `INSERT INTO code_session_cache (session_id, key, value, updated_at) VALUES (?, ?, ?, ?)`,
      ["s1", "repoUrl", "https://github.com/o/r", Date.now()]
    );
    const status = await runner.status({ sessionId: "s1" });
    expect(status.changedFiles).toEqual(["a.ts"]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws when the dynamic worker returns an error", async () => {
    const loader: DynamicWorkerLoader = {
      get: () => ({
        getEntrypoint: () => ({
          fetch: async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
        }),
      }),
    };
    const runner = new DynamicRunner(loader, {
      ai: {} as Ai,
      db: mockDb(),
      githubToken: "t",
      repository: "o/r",
    });

    await expect(runner.scan()).rejects.toThrow("dynamic runner /internal/scan -> 500");
  });
});
