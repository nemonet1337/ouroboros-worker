import { describe, it, expect, vi } from "vitest";
import { CodeIndexer, CODE_INDEX_STATUS_KEY } from "../vectorize/code.indexer";
import { SettingsRepository } from "../db/repositories";
import type { DbAdapter } from "../ports/db";
import type { VectorizePort, VectorizeVector } from "../ports/vectorize";

function mockSettings(): { repo: SettingsRepository; store: Map<string, string> } {
  const store = new Map<string, string>();
  const db: DbAdapter = {
    dialect: "sqlite",
    async query<T>(sql: string, params: any[] = []): Promise<T[]> {
      if (sql.includes("SELECT value FROM settings")) {
        const v = store.get(params[0]);
        return v !== undefined ? ([{ value: v }] as any) : [];
      }
      return [];
    },
    async exec(sql: string, params: any[] = []): Promise<void> {
      if (sql.includes("INSERT INTO settings")) store.set(params[0], String(params[1]));
    },
    async batch(): Promise<void> {},
  };
  return { repo: new SettingsRepository(db), store };
}

function mockVectorize(): { port: VectorizePort; upserted: VectorizeVector[] } {
  const upserted: VectorizeVector[] = [];
  return {
    upserted,
    port: {
      async upsert(vectors) {
        upserted.push(...vectors);
      },
      async query() {
        return [
          {
            id: "src/a.ts#1",
            score: 0.9,
            metadata: { file: "src/a.ts", startLine: 1, endLine: 50, text: "snippet" },
          },
        ];
      },
    },
  };
}

const mockAiWithEmbed = () => ({
  name: "mock",
  complete: vi.fn().mockResolvedValue(""),
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
});

describe("CodeIndexer", () => {
  it("chunks files with 50-line windows and 10-line overlap", () => {
    const { repo } = mockSettings();
    const { port } = mockVectorize();
    const indexer = new CodeIndexer(port, mockAiWithEmbed() as any, { getRepoFiles: async () => [] }, repo);

    const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`);
    const chunks = indexer.chunk({ path: "src/a.ts", content: lines.join("\n") });

    expect(chunks[0]).toMatchObject({ id: "src/a.ts#1", startLine: 1, endLine: 50 });
    expect(chunks[1]).toMatchObject({ id: "src/a.ts#41", startLine: 41, endLine: 90 });
    expect(chunks[2]).toMatchObject({ id: "src/a.ts#81", startLine: 81, endLine: 120 });
    expect(chunks).toHaveLength(3);
  });

  it("reindex embeds chunks, upserts with metadata, and persists done status", async () => {
    const { repo, store } = mockSettings();
    const { port, upserted } = mockVectorize();
    const ai = mockAiWithEmbed();
    const vcs = {
      getRepoFiles: async () => [{ path: "src/a.ts", content: "const a = 1;\nconst b = 2;" }],
    };
    const indexer = new CodeIndexer(port, ai as any, vcs, repo);

    const status = await indexer.reindex();

    expect(status.status).toBe("done");
    expect(status.files).toBe(1);
    expect(status.chunks).toBe(1);
    expect(upserted[0].id).toBe("src/a.ts#1");
    expect(upserted[0].metadata).toMatchObject({ file: "src/a.ts", startLine: 1 });
    expect(JSON.parse(store.get(CODE_INDEX_STATUS_KEY)!).status).toBe("done");
  });

  it("reindex records failed status when embedding is unsupported", async () => {
    const { repo, store } = mockSettings();
    const { port } = mockVectorize();
    const aiNoEmbed = { name: "mock", complete: vi.fn() };
    const indexer = new CodeIndexer(port, aiNoEmbed as any, { getRepoFiles: async () => [] }, repo);

    const status = await indexer.reindex();

    expect(status.status).toBe("failed");
    expect(JSON.parse(store.get(CODE_INDEX_STATUS_KEY)!).status).toBe("failed");
  });

  it("search embeds the query and maps matches to snippets", async () => {
    const { repo } = mockSettings();
    const { port } = mockVectorize();
    const ai = mockAiWithEmbed();
    const indexer = new CodeIndexer(port, ai as any, { getRepoFiles: async () => [] }, repo);

    const snippets = await indexer.search("sql injection in src/a.ts");

    expect(ai.embed).toHaveBeenCalled();
    expect(snippets).toHaveLength(1);
    expect(snippets[0]).toMatchObject({ file: "src/a.ts", startLine: 1, text: "snippet" });
  });
});
