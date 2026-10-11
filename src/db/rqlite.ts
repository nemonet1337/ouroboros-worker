import type { DbAdapter, SqlParam } from "./adapter";

/** rqlite の /db/query・/db/execute レスポンス（statement 単位）。 */
interface RqliteResult {
  /** associative=true のときだけ現れる行配列。 */
  rows?: Record<string, unknown>[];
  error?: string;
}

interface RqliteResponse {
  results?: RqliteResult[];
  error?: string;
}

export interface RqliteAdapterOptions {
  /** rqlite の HTTP エンドポイント。例: `http://127.0.0.1:4001` */
  url: string;
  /** テスト用に fetch を差し替える。 */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

/**
 * DbAdapter backed by a separate rqlite container.
 * rqlite runs SQLite as a network service (HTTP API), so the DB lives in its
 * own container/volume instead of inside the app process — the Docker topology
 * then mirrors the Cloudflare one (Worker → D1 over an API boundary).
 */
export class RqliteAdapter implements DbAdapter {
  readonly dialect = "sqlite" as const;

  #url: string;
  #fetch: (url: string, init?: RequestInit) => Promise<Response>;

  constructor(opts: RqliteAdapterOptions) {
    this.#url = opts.url.replace(/\/+$/, "");
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const json = await this.#post("/db/query?associative=true", [[sql, ...params]]);
    return (json.results?.[0]?.rows ?? []) as T[];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    await this.#post("/db/execute", [[sql, ...params]]);
  }

  async batch(statements: { sql: string; params?: SqlParam[] }[]): Promise<void> {
    if (statements.length === 0) return;
    // transaction=true で 1 トランザクション（SqliteAdapter の BEGIN/COMMIT と同等）
    await this.#post(
      "/db/execute?transaction=true",
      statements.map((s) => [s.sql, ...(s.params ?? [])])
    );
  }

  async #post(path: string, body: unknown): Promise<RqliteResponse> {
    const res = await this.#fetch(`${this.#url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`rqlite ${path} failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as RqliteResponse;
    if (json.error) throw new Error(`rqlite error: ${json.error}`);
    for (const result of json.results ?? []) {
      if (result.error) throw new Error(`rqlite statement error: ${result.error}`);
    }
    return json;
  }
}
