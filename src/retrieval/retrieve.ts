import type { AiProvider } from "../ports";
import { rankChunks, type CodeSnippet } from "./chunk.rank";
import { pickFilesByLuna } from "./file.selector";
import { tokenize } from "./tokenize";

export type RetrievalSource = "luna" | "path" | "fallback";

export interface RetrievalResult {
  /** LLM に渡すファイル本文（maxChars 超で切り詰め）。 */
  files: Array<{ path: string; content: string }>;
  snippets: CodeSnippet[];
  selectedPaths: string[];
  source: RetrievalSource;
  /** Luna が列挙したパス。UI での説明用。 */
  pickedPaths: string[];
}

const DEFAULT_TOP_K = 20;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_CHARS = 12_000;
const MAX_SNIPPETS_PER_FILE = 2;
const IMPORT_HEADER_LINES = 40;
const TEST_SUFFIX = /\.(test|spec)\.[^.]+$|_test\.[^.]+$/i;

/**
 * 検索クエリとパスの一致度でパスを並べる。日本語は tokenize が Intl.Segmenter で
 * 分割するため、英字コード中の識別子もそのまま一致する。
 */
export function scorePathsByTokens(fileList: string[], instruction: string, limit: number): string[] {
  const tokens = tokenize(instruction);
  if (tokens.length === 0) return fileList.slice(0, limit);
  const scored = fileList.map((p) => {
    const lower = p.toLowerCase();
    return { p, hits: tokens.reduce((n, t) => (lower.includes(t) ? n + 1 : n), 0) };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((s) => s.hits > 0).map((s) => s.p);
  const rest = scored.filter((s) => s.hits === 0).map((s) => s.p);
  return [...matched, ...rest].slice(0, limit);
}

function selectPaths(opts: {
  snippets: CodeSnippet[];
  fileList: string[];
  instruction: string;
  picked: string[];
  targetPaths?: string[];
  maxFiles: number;
}): string[] {
  const out: string[] = [];
  const add = (p: string | undefined) => {
    if (!p || out.includes(p) || out.length >= opts.maxFiles) return;
    out.push(p);
  };

  for (const p of opts.targetPaths ?? []) add(p);
  for (const p of opts.picked) add(p);

  const byFile = new Map<string, number>();
  for (const s of opts.snippets) {
    const prev = byFile.get(s.file) ?? Number.NEGATIVE_INFINITY;
    if (s.score > prev) byFile.set(s.file, s.score);
  }
  for (const [file] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) add(file);

  for (const p of scorePathsByTokens(opts.fileList, opts.instruction, opts.maxFiles * 2)) add(p);

  for (const p of [...out]) {
    const neighbor = neighborTest(p, opts.fileList);
    if (neighbor) add(neighbor);
  }

  if (out.length === 0) {
    for (const p of opts.fileList.slice(0, opts.maxFiles)) add(p);
  }
  return out.slice(0, opts.maxFiles);
}

function neighborTest(path: string, fileList: string[]): string | undefined {
  if (TEST_SUFFIX.test(path)) return undefined;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  const candidates = [`${stem}.test${ext}`, `${stem}.spec${ext}`, `${stem}_test${ext}`];
  return candidates.find((c) => fileList.includes(c));
}

function diversifySnippets(snippets: CodeSnippet[]): CodeSnippet[] {
  const counts = new Map<string, number>();
  const out: CodeSnippet[] = [];
  for (const s of snippets) {
    const n = counts.get(s.file) ?? 0;
    if (n >= MAX_SNIPPETS_PER_FILE) continue;
    counts.set(s.file, n + 1);
    out.push(s);
  }
  return out;
}

function importHeaders(
  selectedPaths: string[],
  byPath: Map<string, string>,
  snippets: CodeSnippet[]
): CodeSnippet[] {
  const out: CodeSnippet[] = [];
  for (const path of selectedPaths) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path)) continue;
    const content = byPath.get(path);
    if (!content) continue;
    if (snippets.some((s) => s.file === path && s.startLine <= IMPORT_HEADER_LINES)) continue;
    const header = content.split("\n").slice(0, IMPORT_HEADER_LINES).join("\n");
    if (!header.trim()) continue;
    out.push({
      file: path,
      startLine: 1,
      endLine: IMPORT_HEADER_LINES,
      text: header.slice(0, 800),
      score: 0,
      kind: "other",
      lang: "typescript",
      symbol: "",
    });
  }
  return out;
}

function mergeSnippets(primary: CodeSnippet[], extra: CodeSnippet[]): CodeSnippet[] {
  const seen = new Set(primary.map((s) => `${s.file}:${s.startLine}`));
  return [...primary, ...extra.filter((s) => !seen.has(`${s.file}:${s.startLine}`))];
}

/**
 * インデックスを持たないコード検索。
 *
 * 1. Luna にリポジトリ内の関連ファイルを列挙させる
 * 2. そのファイルだけを chunk 化して embedding し、Worker 内で cosine 順位付け
 * 3. 选了パスから maxFiles / maxChars 制約で本文を切り出す
 */
export async function retrieveContext(opts: {
  ai: AiProvider;
  /** 指示文・finding などの検索クエリ。 */
  instruction: string;
  /** 取得済みファイル（path + content）。 */
  files: Array<{ path: string; content: string }>;
  maxFiles?: number;
  maxChars?: number;
  topK?: number;
  targetPaths?: string[];
  /** 埋め込みモデル ID。省略時はプロバイダの既定。 */
  embedModel?: string;
}): Promise<RetrievalResult> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const fileList = opts.files.map((f) => f.path);
  const byPath = new Map(opts.files.map((f) => [f.path, f.content]));

  const { picked, needsFallback } = await pickFilesByLuna({
    ai: opts.ai,
    repoMap: fileList,
    query: opts.instruction,
    maxFiles,
  });

  // Luna の回答だけだと品質が読めないため、embedding 順位付けの入力に足す。
  const candidates = new Map<string, string>();
  for (const p of picked) {
    const content = byPath.get(p);
    if (content !== undefined) candidates.set(p, content);
  }
  if (needsFallback) {
    for (const p of scorePathsByTokens(fileList, opts.instruction, maxFiles)) {
      const content = byPath.get(p);
      if (content !== undefined && !candidates.has(p)) candidates.set(p, content);
    }
  }

  const source: RetrievalSource = candidates.size === 0 ? "fallback" : needsFallback ? "path" : "luna";
  const snippets = await rankChunks({
    ai: opts.ai,
    query: opts.instruction,
    files: [...candidates].map(([path, content]) => ({ path, content })),
    topK,
    embedModel: opts.embedModel,
  });

  const selectedPaths = selectPaths({
    snippets,
    fileList,
    instruction: opts.instruction,
    picked: picked.filter((p) => candidates.has(p)),
    targetPaths: opts.targetPaths,
    maxFiles,
  });

  const files: Array<{ path: string; content: string }> = [];
  let chars = 0;
  for (const path of selectedPaths) {
    const content = byPath.get(path);
    if (content === undefined) continue;
    if (chars >= maxChars) break;
    const slice = content.length > maxChars - chars ? content.slice(0, maxChars - chars) : content;
    files.push({ path, content: slice });
    chars += slice.length;
  }

  const headers = importHeaders(selectedPaths, byPath, snippets);
  return {
    files,
    snippets: mergeSnippets(diversifySnippets(snippets), headers),
    selectedPaths,
    source,
    pickedPaths: picked,
  };
}
