import type { CodeIndexer, CodeSnippet } from "../vectorize/code.indexer";

export type ContextSource = "vectorize" | "path" | "tarball-fallback";

export interface AssembledContext {
  query: string;
  snippets: CodeSnippet[];
  files: { path: string; content: string }[];
  repoMap: string[];
  selectedPaths: string[];
  source: ContextSource;
}

const DEFAULT_TOP_K = 20;
const DEFAULT_MAX_FILES = 8;
const DEFAULT_MAX_CHARS = 12_000;
const MAX_SNIPPETS_PER_FILE = 2;
const IMPORT_HEADER_LINES = 40;
const TEST_SUFFIX = /\.(test|spec)\.[^.]+$|_test\.[^.]+$/i;

export async function assembleContext(opts: {
  query: string;
  indexer?: CodeIndexer;
  files: Array<{ path: string; content: string }>;
  namespace?: string;
  topK?: number;
  maxFiles?: number;
  maxChars?: number;
  targetPaths?: string[];
}): Promise<AssembledContext> {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const fileList = opts.files.map((f) => f.path);
  const byPath = new Map(opts.files.map((f) => [f.path, f.content]));

  let snippets: CodeSnippet[] = [];
  let source: ContextSource = fileList.length > 0 ? "path" : "tarball-fallback";
  if (opts.indexer) {
    try {
      snippets = await opts.indexer.search(opts.query, opts.topK ?? DEFAULT_TOP_K, {
        namespace: opts.namespace,
      });
      if (snippets.length > 0) source = "vectorize";
    } catch {
      snippets = [];
    }
  }

  const selectedPaths = selectPaths({
    snippets,
    fileList,
    query: opts.query,
    targetPaths: opts.targetPaths,
    maxFiles,
  });

  const files: { path: string; content: string }[] = [];
  let chars = 0;
  for (const path of selectedPaths) {
    const content = byPath.get(path);
    if (content === undefined) continue;
    if (chars >= maxChars) break;
    const slice = content.length > maxChars - chars ? content.slice(0, maxChars - chars) : content;
    files.push({ path, content: slice });
    chars += slice.length;
  }

  const headerSnippets = importHeaders(selectedPaths, byPath, snippets);
  const diversified = diversifySnippets(snippets);

  return {
    query: opts.query,
    snippets: mergeSnippets(diversified, headerSnippets),
    files,
    repoMap: fileList,
    selectedPaths,
    source,
  };
}

/** Inspection / healing analyze 用。I/O は増やさずパスだけ返す。 */
export async function selectPathsForAnalysis(opts: {
  query: string;
  indexer: CodeIndexer;
  maxFiles: number;
  namespace?: string;
}): Promise<{ paths: string[]; snippets: CodeSnippet[]; source: ContextSource }> {
  let snippets: CodeSnippet[] = [];
  try {
    snippets = await opts.indexer.search(opts.query, DEFAULT_TOP_K, { namespace: opts.namespace });
  } catch {
    snippets = [];
  }
  const paths = selectPaths({
    snippets,
    fileList: snippets.map((s) => s.file),
    query: opts.query,
    maxFiles: opts.maxFiles,
  });
  return {
    paths,
    snippets,
    source: snippets.length > 0 ? "vectorize" : "tarball-fallback",
  };
}

export function selectPaths(opts: {
  snippets: CodeSnippet[];
  fileList: string[];
  query: string;
  targetPaths?: string[];
  maxFiles: number;
}): string[] {
  const out: string[] = [];
  const add = (p: string | undefined) => {
    if (!p || out.includes(p) || out.length >= opts.maxFiles) return;
    out.push(p);
  };

  for (const p of opts.targetPaths ?? []) add(p);

  const byFile = new Map<string, number>();
  for (const s of opts.snippets) {
    const prev = byFile.get(s.file) ?? Number.NEGATIVE_INFINITY;
    if (s.score > prev) byFile.set(s.file, s.score);
  }
  const ranked = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
  for (const [file] of ranked) add(file);

  for (const p of scorePathsByTokens(opts.fileList, opts.query, opts.maxFiles * 2)) add(p);

  for (const p of [...out]) {
    const neighbor = neighborTest(p, opts.fileList);
    if (neighbor) add(neighbor);
  }

  if (out.length === 0) {
    for (const p of opts.fileList.slice(0, opts.maxFiles)) add(p);
  }
  return out.slice(0, opts.maxFiles);
}

export function scorePathsByTokens(fileList: string[], instruction: string, limit: number): string[] {
  const tokens = instruction
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .filter((t) => t.length > 2);
  const scored = fileList.map((p) => {
    const lower = p.toLowerCase();
    const hits = tokens.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
    return { p, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  const matched = scored.filter((s) => s.hits > 0).map((s) => s.p);
  const rest = scored.filter((s) => s.hits === 0).map((s) => s.p);
  return [...matched, ...rest].slice(0, limit);
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

function neighborTest(path: string, fileList: string[]): string | undefined {
  if (TEST_SUFFIX.test(path)) return undefined;
  const dot = path.lastIndexOf(".");
  if (dot < 0) return undefined;
  const stem = path.slice(0, dot);
  const ext = path.slice(dot);
  const candidates = [`${stem}.test${ext}`, `${stem}.spec${ext}`, `${stem}_test${ext}`];
  return candidates.find((c) => fileList.includes(c));
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
    const hasEarly = snippets.some((s) => s.file === path && s.startLine <= IMPORT_HEADER_LINES);
    if (hasEarly) continue;
    const lines = content.split("\n");
    const header = lines.slice(0, IMPORT_HEADER_LINES).join("\n");
    if (!header.trim()) continue;
    out.push({
      file: path,
      startLine: 1,
      endLine: Math.min(IMPORT_HEADER_LINES, lines.length),
      text: header.slice(0, 800),
      score: 0,
      kind: "other",
    });
  }
  return out;
}

function mergeSnippets(primary: CodeSnippet[], extra: CodeSnippet[]): CodeSnippet[] {
  const seen = new Set(primary.map((s) => `${s.file}:${s.startLine}`));
  const out = [...primary];
  for (const s of extra) {
    const key = `${s.file}:${s.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
