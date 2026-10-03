import { MAX_RANKED_CHUNKS } from "../config/deployment";
import type { AiProvider } from "../ports";
import { chunkFile, type ChunkKind, type CodeChunk } from "./chunker";

export interface CodeSnippet {
  file: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
  lang: string;
  kind: ChunkKind;
  symbol: string;
}

interface RankedChunk {
  chunk: CodeChunk;
  file: string;
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 候補ファイルを chunk 化して embedding し、Worker 内で cosine を計算する。
 * 外部コードインデックスの代替。インデックスは持たないので、リクエストごとに embedding する。
 *
 * chunk 数の上限は Worker の CPU 時間内に収めるため MAX_RANKED_CHUNKS で守る。
 */
export async function rankChunks(opts: {
  ai: AiProvider;
  query: string;
  files: Array<{ path: string; content: string }>;
  topK: number;
}): Promise<CodeSnippet[]> {
  const embed = opts.ai.embed?.bind(opts.ai);
  if (!embed) return [];

  let candidates: RankedChunk[] = [];
  for (const file of opts.files) {
    for (const chunk of chunkFile(file)) {
      candidates.push({ chunk, file: file.path });
    }
  }
  if (candidates.length === 0) return [];
  if (candidates.length > MAX_RANKED_CHUNKS) candidates = candidates.slice(0, MAX_RANKED_CHUNKS);

  let vectors: number[][];
  try {
    vectors = await embed(candidates.map((c) => c.chunk.text));
  } catch (err) {
    console.warn("[retrieval] embedding failed:", err instanceof Error ? err.message : err);
    return [];
  }
  if (vectors.length !== candidates.length) return [];

  const [queryVector] = await embed([opts.query]);
  if (!queryVector || queryVector.length === 0) return [];

  return candidates
    .map((c, i) => ({
      file: c.file,
      startLine: c.chunk.startLine,
      endLine: c.chunk.endLine,
      text: c.chunk.text,
      score: cosine(queryVector, vectors[i]),
      lang: c.chunk.lang,
      kind: c.chunk.kind,
      symbol: c.chunk.symbol,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.topK);
}
