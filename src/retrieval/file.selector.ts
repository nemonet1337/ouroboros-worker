import { FILE_PICK_MAX } from "../config/deployment";
import { DEFAULT_ROUTING_CONFIG } from "../config/routing";
import type { AiProvider } from "../ports";

const PICK_SYSTEM = [
  "You select which repository files must be read to implement a task.",
  "Reply with file paths only, one per line, most important first.",
  "Use exact paths from the provided list. Do not explain. Do not write code.",
  "Skip build artifacts, lock files and vendored dependencies.",
].join("\n");

/** 返答からパス行だけを拾う。`path` や `- path` のような装飾を除去する。 */
export function parsePathList(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const cleaned = line
      .trim()
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/^`+/, "")
      .replace(/`+$/, "")
      .trim();
    if (!cleaned || /\s/.test(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export interface PickFilesResult {
  /** repoMap に実在するパスだけ、元の順序を保って返す。 */
  picked: string[];
  /** Luna が選択できず、呼び出し側のフォールバックが必要か。 */
  needsFallback: boolean;
}

/**
 * Luna にリポジトリ内の関連ファイルを選択させる。インデックスを持たないため、
 * 検索の入口になる。
 *
 * - 返答に repoMap に無いパスが混ざっても除去する
 * - 1 件も採用できなかった場合は needsFallback で呼び出し側へ委ねる
 */
export async function pickFilesByLuna(opts: {
  ai: AiProvider;
  repoMap: string[];
  query: string;
  maxFiles?: number;
}): Promise<PickFilesResult> {
  const limit = Math.min(opts.maxFiles ?? FILE_PICK_MAX, FILE_PICK_MAX);
  if (opts.repoMap.length === 0 || limit <= 0 || !opts.query.trim()) {
    return { picked: [], needsFallback: true };
  }

  const listed = opts.repoMap.join("\n");
  let raw: string;
  try {
    raw = await opts.ai.complete({
      model: DEFAULT_ROUTING_CONFIG.efficiencyModel,
      system: PICK_SYSTEM,
      prompt: `Repository files:\n${listed}\n\nTask:\n${opts.query}\n\nUp to ${limit} file paths, most important first:`,
      maxTokens: 64 * limit,
      reasoningEffort: DEFAULT_ROUTING_CONFIG.efficiencyEffort,
    });
  } catch (err) {
    console.warn("[retrieval] file selection failed:", err instanceof Error ? err.message : err);
    return { picked: [], needsFallback: true };
  }

  const allowed = new Set(opts.repoMap);
  const picked: string[] = [];
  for (const path of parsePathList(raw ?? "")) {
    if (!allowed.has(path)) continue;
    picked.push(path);
    if (picked.length >= limit) break;
  }
  return { picked, needsFallback: picked.length === 0 };
}
