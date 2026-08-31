import type { VectorizePort } from "../ports/vectorize";
import type { AiProvider } from "../ports/ai";
import { SettingsRepository } from "../db/repositories";
import { getEmbeddingModel } from "../config/settings.keys";
import {
  CHUNK_MAX_CHARS,
  chunkFile,
  codeIndexStatusKey,
  vectorizeNamespace,
  type CodeChunk,
} from "./chunker";

export const CODE_INDEX_STATUS_KEY = "code_index_status";

export interface CodeIndexStatus {
  status: "indexing" | "done" | "failed";
  files: number;
  chunks: number;
  updatedAt: number;
  error?: string;
  commitSha?: string;
  namespace?: string;
  chunkIds?: string[];
}

export interface CodeSnippet {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
  lang?: string;
  kind?: string;
  symbol?: string;
}

export interface CodeSearchOptions {
  namespace?: string;
  filter?: Record<string, string | number | boolean>;
}

interface RepoFileSource {
  getRepoFiles(maxFiles?: number, ref?: string): Promise<Array<{ path: string; content: string }>>;
  getHeadSha?(): Promise<string>;
  owner?: string;
  repo?: string;
}

const MAX_INDEX_FILES = 200;
const MAX_CHUNKS = 500;
const EMBED_BATCH = 100;
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

  namespace(): string {
    return vectorizeNamespace(this.vcs.owner ?? "", this.vcs.repo ?? "");
  }

  /** シンボル境界 + 余り行窓。Vectorize id は 32 hex。 */
  chunk(file: { path: string; content: string }, namespace?: string): CodeChunk[] {
    return chunkFile(file, namespace ?? this.namespace());
  }

  async reindex(): Promise<CodeIndexStatus> {
    if (!this.ai.embed) {
      const status: CodeIndexStatus = {
        status: "failed",
        files: 0,
        chunks: 0,
        updatedAt: Date.now(),
        namespace: this.namespace(),
        error: "AI provider does not support embeddings",
      };
      await this.saveStatus(status);
      return status;
    }

    const ns = this.namespace();
    const commitSha = await this.vcs.getHeadSha?.().catch(() => undefined);
    const prev = await this.getStatus(ns);
    if (commitSha && prev?.status === "done" && prev.commitSha === commitSha) {
      return prev;
    }

    await this.saveStatus({
      status: "indexing",
      files: 0,
      chunks: 0,
      updatedAt: Date.now(),
      commitSha,
      namespace: ns,
      chunkIds: prev?.chunkIds,
    });

    try {
      const files = await this.vcs.getRepoFiles(MAX_INDEX_FILES);
      const allChunks: Array<CodeChunk & { file: string }> = [];
      for (const file of files) {
        for (const chunk of this.chunk(file, ns)) {
          allChunks.push({ ...chunk, file: file.path });
          if (allChunks.length >= MAX_CHUNKS) break;
        }
        if (allChunks.length >= MAX_CHUNKS) break;
      }

      if (prev?.chunkIds && prev.chunkIds.length > 0) {
        await this.vectorize.deleteByIds(prev.chunkIds);
      }

      const vectors: number[][] = [];
      for (let i = 0; i < allChunks.length; i += EMBED_BATCH) {
        const batch = allChunks.slice(i, i + EMBED_BATCH);
        vectors.push(...(await this.embedTexts(batch.map((c) => c.text))));
      }
      if (allChunks.length > 0) {
        await this.vectorize.upsert(
          allChunks.map((c, i) => ({
            id: c.id,
            values: vectors[i],
            namespace: ns,
            metadata: {
              file: c.file,
              startLine: c.startLine,
              endLine: c.endLine,
              text: c.text.slice(0, METADATA_TEXT_LIMIT),
              lang: c.lang,
              kind: c.kind,
              symbol: c.symbol,
            },
          }))
        );
      }

      const status: CodeIndexStatus = {
        status: "done",
        files: files.length,
        chunks: allChunks.length,
        updatedAt: Date.now(),
        commitSha,
        namespace: ns,
        chunkIds: allChunks.map((c) => c.id),
      };
      await this.saveStatus(status);
      return status;
    } catch (err) {
      const status: CodeIndexStatus = {
        status: "failed",
        files: 0,
        chunks: 0,
        updatedAt: Date.now(),
        namespace: ns,
        chunkIds: prev?.chunkIds,
        error: err instanceof Error ? err.message : String(err),
      };
      await this.saveStatus(status);
      return status;
    }
  }

  async search(query: string, topK = 8, opts?: CodeSearchOptions): Promise<CodeSnippet[]> {
    if (!this.ai.embed) return [];
    const ns = opts?.namespace ?? this.namespace();
    const [vector] = await this.embedTexts([query.slice(0, CHUNK_MAX_CHARS)]);
    const matches = await this.vectorize.query(vector, {
      topK,
      namespace: ns,
      filter: opts?.filter,
    });
    return matches
      .filter((m) => m.metadata?.file !== undefined)
      .map((m) => ({
        file: String(m.metadata!.file),
        startLine: Number(m.metadata!.startLine ?? 0),
        endLine: Number(m.metadata!.endLine ?? 0),
        text: String(m.metadata!.text ?? ""),
        score: m.score,
        lang: m.metadata!.lang !== undefined ? String(m.metadata!.lang) : undefined,
        kind: m.metadata!.kind !== undefined ? String(m.metadata!.kind) : undefined,
        symbol: m.metadata!.symbol !== undefined ? String(m.metadata!.symbol) : undefined,
      }));
  }

  async getStatus(namespace?: string): Promise<CodeIndexStatus | null> {
    const ns = namespace ?? this.namespace();
    const keyed = await this.readStatus(codeIndexStatusKey(ns));
    if (keyed) return keyed;
    if (ns !== "default") {
      const legacy = await this.readStatus(CODE_INDEX_STATUS_KEY);
      if (legacy) return legacy;
    }
    return null;
  }

  private async readStatus(key: string): Promise<CodeIndexStatus | null> {
    const raw = await this.settings.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CodeIndexStatus;
    } catch {
      return null;
    }
  }

  private async saveStatus(status: CodeIndexStatus): Promise<void> {
    const key = codeIndexStatusKey(status.namespace ?? this.namespace());
    await this.settings.set(key, JSON.stringify(status));
  }

  private async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.ai.embed) throw new Error("AI provider does not support embeddings");
    const model = await getEmbeddingModel(this.settings);
    return this.ai.embed(texts, model);
  }
}
