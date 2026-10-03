import type { AiProvider } from "../ports";
import { retrieveContext, scorePathsByTokens, type RetrievalSource } from "../retrieval/retrieve";
import type { CodeSnippet } from "../retrieval/chunk.rank";

export type { CodeSnippet } from "../retrieval/chunk.rank";
export { scorePathsByTokens } from "../retrieval/retrieve";

export type ContextSource = RetrievalSource;

export interface AssembledContext {
  query: string;
  snippets: CodeSnippet[];
  files: { path: string; content: string }[];
  repoMap: string[];
  selectedPaths: string[];
  source: ContextSource;
  /** Luna が列挙したパス。UI での説明用。 */
  pickedPaths: string[];
}

const DEFAULT_TOP_K = 20;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_CHARS = 12_000;

/**
 * インデックスを持たないため、外部のコードインデックスはここに無い。
 * 検索は retrieveContext（Luna によるファイル選択 + embedding 順位付け）が担う。
 * 検索は retrieveContext（Luna によるファイル選択 + embedding 順位付け）が担う。
 */
export async function assembleContext(opts: {
  query: string;
  ai: AiProvider;
  files: Array<{ path: string; content: string }>;
  topK?: number;
  maxFiles?: number;
  maxChars?: number;
  targetPaths?: string[];
}): Promise<AssembledContext> {
  const result = await retrieveContext({
    ai: opts.ai,
    instruction: opts.query,
    files: opts.files,
    maxFiles: opts.maxFiles ?? DEFAULT_MAX_FILES,
    maxChars: opts.maxChars ?? DEFAULT_MAX_CHARS,
    topK: opts.topK ?? DEFAULT_TOP_K,
    targetPaths: opts.targetPaths,
  });
  return {
    query: opts.query,
    snippets: result.snippets,
    files: result.files,
    repoMap: opts.files.map((f) => f.path),
    selectedPaths: result.selectedPaths,
    source: result.source,
    pickedPaths: result.pickedPaths,
  };
}

/** inspection / healing analyze 用。I/O は増やさずパスだけ返す。 */
export async function selectPathsForAnalysis(opts: {
  query: string;
  ai: AiProvider;
  files: Array<{ path: string; content: string }>;
  maxFiles: number;
}): Promise<{ paths: string[]; snippets: CodeSnippet[]; source: ContextSource }> {
  const assembled = await assembleContext({
    query: opts.query,
    ai: opts.ai,
    files: opts.files,
    maxFiles: opts.maxFiles,
  });
  return {
    paths: assembled.selectedPaths,
    snippets: assembled.snippets,
    source: assembled.source,
  };
}
