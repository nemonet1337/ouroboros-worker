export type ChunkKind = "fn" | "class" | "type" | "test" | "config" | "other";

export interface CodeChunk {
  id: string;
  startLine: number;
  endLine: number;
  text: string;
  lang: string;
  kind: ChunkKind;
  symbol: string;
}

export const CHUNK_LINES = 50;
export const CHUNK_OVERLAP = 10;
export const CHUNK_MAX_CHARS = 1500;

const CONFIG_NAME =
  /(^|\/)(package\.json|tsconfig.*\.json|wrangler\.(toml|jsonc?)|Cargo\.toml|go\.mod|pyproject\.toml|Gemfile|Dockerfile|.*\.(ya?ml|toml))$/i;
const TEST_NAME = /\.(test|spec)\.[^.]+$|_test\.[^.]+$|\/tests?\//i;

interface SymbolPattern {
  re: RegExp;
  kind: Exclude<ChunkKind, "test" | "config" | "other">;
  symbolGroup: number;
}

const TS_JS: SymbolPattern[] = [
  { re: /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/, kind: "class", symbolGroup: 1 },
  { re: /^(?:export\s+)?interface\s+(\w+)/, kind: "type", symbolGroup: 1 },
  { re: /^(?:export\s+)?type\s+(\w+)\s*=/, kind: "type", symbolGroup: 1 },
  { re: /^(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\(|function\b)/, kind: "fn", symbolGroup: 1 },
];

const PYTHON: SymbolPattern[] = [
  { re: /^(?:async\s+)?def\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^class\s+(\w+)/, kind: "class", symbolGroup: 1 },
];

const GO: SymbolPattern[] = [
  { re: /^func\s+(?:\([^)]+\)\s+)?(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^type\s+(\w+)\s+struct/, kind: "class", symbolGroup: 1 },
];

const RUST: SymbolPattern[] = [
  { re: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, kind: "fn", symbolGroup: 1 },
  { re: /^(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/, kind: "type", symbolGroup: 1 },
];

const LANG_PATTERNS: Record<string, SymbolPattern[]> = {
  typescript: TS_JS,
  javascript: TS_JS,
  python: PYTHON,
  go: GO,
  rust: RUST,
};

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
};

export function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "other";
}

/** Vectorize namespace は 64 バイト上限。`owner/repo` を優先し、長い場合は 32 hex。 */
export function vectorizeNamespace(owner: string, repo: string): string {
  if (!owner && !repo) return "default";
  const raw = `${owner}/${repo}`;
  if (new TextEncoder().encode(raw).length <= 64) return raw;
  return hash32(raw);
}

export function codeIndexStatusKey(namespace?: string): string {
  if (!namespace || namespace === "default") return "code_index_status";
  return `code_index_status:${namespace}`;
}

export function chunkFile(
  file: { path: string; content: string },
  namespace = ""
): CodeChunk[] {
  const lang = langFromPath(file.path);
  const isTest = TEST_NAME.test(file.path);
  const isConfig = CONFIG_NAME.test(file.path);
  const lines = file.content.split("\n");
  const forceKind: ChunkKind | undefined = isConfig ? "config" : isTest ? "test" : undefined;

  const regions = isConfig ? [{ start: 0, end: lines.length, kind: "config" as ChunkKind, symbol: "" }] : symbolRegions(lines, lang);

  const chunks: CodeChunk[] = [];
  for (const region of regions) {
    const kind = forceKind ?? region.kind;
    for (const window of windows(region.start, region.end, lines.length)) {
      const text = lines.slice(window.start, window.end).join("\n").slice(0, CHUNK_MAX_CHARS);
      if (text.trim().length === 0) continue;
      chunks.push({
        id: chunkId(namespace, file.path, window.start + 1, kind),
        startLine: window.start + 1,
        endLine: window.end,
        text,
        lang,
        kind,
        symbol: region.symbol,
      });
    }
  }
  return chunks;
}

export function chunkId(namespace: string, path: string, startLine: number, kind: string): string {
  return hash32(`${namespace}:${path}#${startLine}:${kind}`);
}

function symbolRegions(
  lines: string[],
  lang: string
): Array<{ start: number; end: number; kind: ChunkKind; symbol: string }> {
  const patterns = LANG_PATTERNS[lang] ?? [];
  const hits: Array<{ line: number; kind: ChunkKind; symbol: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    for (const p of patterns) {
      const m = trimmed.match(p.re);
      if (m) {
        hits.push({ line: i, kind: p.kind, symbol: m[p.symbolGroup] ?? "" });
        break;
      }
    }
  }

  if (hits.length === 0) {
    return [{ start: 0, end: lines.length, kind: "other", symbol: "" }];
  }

  const regions: Array<{ start: number; end: number; kind: ChunkKind; symbol: string }> = [];
  if (hits[0].line > 0) {
    regions.push({ start: 0, end: hits[0].line, kind: "other", symbol: "" });
  }
  for (let i = 0; i < hits.length; i++) {
    const end = i + 1 < hits.length ? hits[i + 1].line : lines.length;
    regions.push({ start: hits[i].line, end, kind: hits[i].kind, symbol: hits[i].symbol });
  }
  return regions;
}

function windows(start: number, end: number, _lineCount: number): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const step = CHUNK_LINES - CHUNK_OVERLAP;
  for (let s = start; s < end; s += step) {
    const e = Math.min(s + CHUNK_LINES, end);
    out.push({ start: s, end: e });
    if (e >= end) break;
  }
  return out;
}

/** Vectorize id は 64 バイト上限。同期 digest は WebCrypto に無いため FNV-1a 相当で 32 hex。 */
export function hash32(input: string): string {
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
