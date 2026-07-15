import type { VectorizePort } from "../ports/vectorize";
import type { AiProvider } from "../ports/ai";
import { SettingsRepository } from "../db/repositories";

export const CODE_INDEX_STATUS_KEY = "code_index_status";

export interface CodeIndexStatus {
  status: "indexing" | "done" | "failed";
  files: number;
  chunks: number;
  updatedAt: number;
  error?: string;
}

export interface CodeSnippet {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

interface RepoFileSource {
  getRepoFiles(maxFiles?: number, ref?: string): Promise<Array<{ path: string; content: string }>>;
}

const CHUNK_LINES = 50;
const CHUNK_OVERLAP = 10;
const CHUNK_MAX_CHARS = 1500;
const MAX_CHUNKS = 2000;
const METADATA_TEXT_LIMIT = 800;

/**
 * リポジトリのコードを埋め込みベクトル化して Vectorize（ouroboros-code-index）に
 * 保存し、自己修復解析時に関連コードスニペットを検索する。
 */
export class CodeIndexer {
  constructor(
    private readonly vectorize: VectorizePort,
    private readonly ai: AiProvider,
    private readonly vcs: RepoFileSource,
    private readonly settings: SettingsRepository
  ) {}

  /** ~50 行の窓 + 10 行オーバーラップでチャンク化する */
  chunk(file: { path: string; content: string }): Array<{ id: string; startLine: number; endLine: number; text: string }> {
    const lines = file.content.split("\n");
    const chunks: Array<{ id: string; startLine: number; endLine: number; text: string }> = [];
    for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
      const end = Math.min(start + CHUNK_LINES, lines.length);
      const text = lines.slice(start, end).join("\n").slice(0, CHUNK_MAX_CHARS);
      if (text.trim().length > 0) {
        chunks.push({
          id: `${file.path}#${start + 1}`,
          startLine: start + 1,
          endLine: end,
          text,
        });
      }
      if (end >= lines.length) break;
    }
    return chunks;
  }

  async reindex(): Promise<CodeIndexStatus> {
    if (!this.ai.embed) {
      const status: CodeIndexStatus = {
        status: "failed",
        files: 0,
        chunks: 0,
        updatedAt: Date.now(),
        error: "AI provider does not support embeddings",
      };
      await this.saveStatus(status);
      return status;
    }

    await this.saveStatus({ status: "indexing", files: 0, chunks: 0, updatedAt: Date.now() });

    try {
      const files = await this.vcs.getRepoFiles();
      const allChunks: Array<{ id: string; file: string; startLine: number; endLine: number; text: string }> = [];
      for (const file of files) {
        for (const chunk of this.chunk(file)) {
          allChunks.push({ ...chunk, file: file.path });
          if (allChunks.length >= MAX_CHUNKS) break;
        }
        if (allChunks.length >= MAX_CHUNKS) break;
      }

      // 100 件ずつ埋め込み + upsert（Queue コンシューマーの実行時間内に収める）
      for (let i = 0; i < allChunks.length; i += 100) {
        const batch = allChunks.slice(i, i + 100);
        const vectors = await this.ai.embed(batch.map((c) => c.text));
        await this.vectorize.upsert(
          batch.map((c, j) => ({
            id: c.id,
            values: vectors[j],
            metadata: {
              file: c.file,
              startLine: c.startLine,
              endLine: c.endLine,
              text: c.text.slice(0, METADATA_TEXT_LIMIT),
            },
          }))
        );
      }

      const status: CodeIndexStatus = {
        status: "done",
        files: files.length,
        chunks: allChunks.length,
        updatedAt: Date.now(),
      };
      await this.saveStatus(status);
      return status;
    } catch (err) {
      const status: CodeIndexStatus = {
        status: "failed",
        files: 0,
        chunks: 0,
        updatedAt: Date.now(),
        error: err instanceof Error ? err.message : String(err),
      };
      await this.saveStatus(status);
      return status;
    }
  }

  async search(query: string, topK = 8): Promise<CodeSnippet[]> {
    if (!this.ai.embed) return [];
    const [vector] = await this.ai.embed([query.slice(0, CHUNK_MAX_CHARS)]);
    const matches = await this.vectorize.query(vector, { topK });
    return matches
      .filter((m) => m.metadata?.file !== undefined)
      .map((m) => ({
        file: String(m.metadata!.file),
        startLine: Number(m.metadata!.startLine ?? 0),
        endLine: Number(m.metadata!.endLine ?? 0),
        text: String(m.metadata!.text ?? ""),
        score: m.score,
      }));
  }

  async getStatus(): Promise<CodeIndexStatus | null> {
    const raw = await this.settings.get(CODE_INDEX_STATUS_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CodeIndexStatus;
    } catch {
      return null;
    }
  }

  private async saveStatus(status: CodeIndexStatus): Promise<void> {
    await this.settings.set(CODE_INDEX_STATUS_KEY, JSON.stringify(status));
  }
}
