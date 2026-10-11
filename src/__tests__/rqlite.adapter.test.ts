import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RqliteAdapter } from "../db/rqlite";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** fetch を差し替え、呼び出しを記録する。 */
function recorder(responder: (url: string, init: RequestInit) => Response): {
  calls: { url: string; init: RequestInit }[];
  adapter: RqliteAdapter;
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return responder(url, init ?? {});
  });
  return { calls, adapter: new RqliteAdapter({ url: "http://rqlite.test:4001/", fetchImpl }) };
}

function parsedBody(call: { url: string; init: RequestInit }): unknown {
  return JSON.parse(call.init.body as string);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RqliteAdapter", () => {
  it("sends SELECTs to /db/query with associative rows and returns objects", async () => {
    const { calls, adapter } = recorder(() =>
      json({ results: [{ types: { id: "text" }, rows: [{ id: "u1" }] }] })
    );

    const rows = await adapter.query<{ id: string }>("SELECT id FROM users WHERE id = ?", ["u1"]);

    expect(rows).toEqual([{ id: "u1" }]);
    expect(calls[0].url).toBe("http://rqlite.test:4001/db/query?associative=true");
    expect(parsedBody(calls[0])).toEqual([["SELECT id FROM users WHERE id = ?", "u1"]]);
  });

  it("sends writes to /db/execute and tolerates empty results", async () => {
    const { calls, adapter } = recorder(() => json({ results: [{}] }));

    await adapter.exec("UPDATE users SET role = ? WHERE id = ?", ["admin", "u1"]);

    expect(calls[0].url).toBe("http://rqlite.test:4001/db/execute");
    expect(parsedBody(calls[0])).toEqual([["UPDATE users SET role = ? WHERE id = ?", "admin", "u1"]]);
  });

  it("runs batch statements as one transaction", async () => {
    const { calls, adapter } = recorder(() =>
      json({ results: [{ rows_affected: 1 }, { rows_affected: 1 }] })
    );

    await adapter.batch([
      { sql: "INSERT INTO users(id) VALUES(?)", params: ["a"] },
      { sql: "INSERT INTO sessions(id) VALUES(?)", params: ["s"] },
    ]);

    expect(calls[0].url).toBe("http://rqlite.test:4001/db/execute?transaction=true");
    expect(parsedBody(calls[0])).toEqual([
      ["INSERT INTO users(id) VALUES(?)", "a"],
      ["INSERT INTO sessions(id) VALUES(?)", "s"],
    ]);
  });

  it("treats an empty batch as a no-op without calling rqlite", async () => {
    const { calls, adapter } = recorder(() => json({ results: [] }));

    await adapter.batch([]);

    expect(calls).toHaveLength(0);
  });

  it("throws on statement-level errors", async () => {
    const { adapter } = recorder(() => json({ results: [{ error: "no such table: users" }] }));

    await expect(adapter.query("SELECT * FROM users")).rejects.toThrow("no such table: users");
  });

  it("throws on HTTP failures", async () => {
    const { adapter } = recorder(() => json({ error: "leader unavailable" }, 500));

    await expect(adapter.exec("INSERT INTO users(id) VALUES(?)", ["a"])).rejects.toThrow(
      "HTTP 500"
    );
  });

  it("reports the sqlite dialect so shared SQL branching is unchanged", () => {
    const adapter = new RqliteAdapter({ url: "http://rqlite.test:4001" });
    expect(adapter.dialect).toBe("sqlite");
  });
});
