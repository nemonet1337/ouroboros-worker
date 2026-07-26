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
// ファイル取得は tarball 1 リクエストになったため、subrequest 予算を消費するのは
// 埋め込み呼び出し（MAX_CHUNKS / EMBED_BATCH 回）と upsert（1 回）のみ。
// 無料プランの上限 50/呼び出しに収まるようチャンク数を絞る。
const MAX_INDEX_FILES = 200;
const MAX_CHUNKS = 500;
const EMBED_BATCH = 100; // bge-base-en-v1.5 のバッチ上限
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

  /** ~50 行の窓 + 10 行オーバーラップでチャンク化する。
   * Vectorize の vector id は最大 64 バイトのため、パス#line を SHA-256 先頭 32 hex にハッシュする。
   */
  chunk(file: { path: string; content: string }): Array<{ id: string; startLine: number; endLine: number; text: string }> {
    const lines = file.content.split("\n");
    const chunks: Array<{ id: string; startLine: number; endLine: number; text: string }> = [];
    for (let start = 0; start < lines.length; start += CHUNK_LINES - CHUNK_OVERLAP) {
      const end = Math.min(start + CHUNK_LINES, lines.length);
      const text = lines.slice(start, end).join("\n").slice(0, CHUNK_MAX_CHARS);
      if (text.trim().length > 0) {
        chunks.push({
          id: chunkId(file.path, start + 1),
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
      const files = await this.vcs.getRepoFiles(MAX_INDEX_FILES);
      const allChunks: Array<{ id: string; file: string; startLine: number; endLine: number; text: string }> = [];
      for (const file of files) {
        for (const chunk of this.chunk(file)) {
          allChunks.push({ ...chunk, file: file.path });
          if (allChunks.length >= MAX_CHUNKS) break;
        }
        if (allChunks.length >= MAX_CHUNKS) break;
      }

      // 埋め込みは 100 件バッチ、upsert は一括 1 回（subrequest 上限に配慮）
      const vectors: number[][] = [];
      for (let i = 0; i < allChunks.length; i += EMBED_BATCH) {
        const batch = allChunks.slice(i, i + EMBED_BATCH);
        vectors.push(...(await this.ai.embed(batch.map((c) => c.text))));
      }
      if (allChunks.length > 0) {
        await this.vectorize.upsert(
          allChunks.map((c, i) => ({
            id: c.id,
            values: vectors[i],
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

/** Vectorize id は 64 バイト上限。パス#line を SHA-256 hex 先頭 32 文字にする。 */
function chunkId(path: string, startLine: number): string {
  // 同期 digest は WebCrypto に無いため、簡易 FNV-1a + パス短縮で 32 hex 相当を生成。
  // 衝突耐性より長さ制限の遵守を優先。メタデータに path/line を保存済み。
  const input = `${path}#${startLine}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x01000193);
  }
  return (
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0") +
    Math.imul(h1 ^ h2, 0x85ebca6b).toString(16).padStart(8, "0").slice(0, 8) +
    Math.imul(h1 + h2, 0xc2b2ae35).toString(16).padStart(8, "0").slice(0, 8)
  );
}
