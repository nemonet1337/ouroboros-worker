import { FILE_PICK_MAX, LAYA_FILE_BATCH_LIMIT } from "../config/deployment";
import { DEFAULT_ROUTING_CONFIG } from "../config/routing";
import type { AiClefQuestion, AiProvider, LocalDecisionConfig } from "../ai/types";

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

/** ローカル Laya の noul 応答から必要度を取り出す。 */
export function parseNoulScore(answer: unknown): number {
  if (typeof answer === "number") return answer;
  if (!answer || typeof answer !== "object") return 0;
  const obj = answer as Record<string, unknown>;
  if (typeof obj.noul === "number") return obj.noul;
  if (typeof obj.score === "number") return obj.score;
  const probs = (obj.probabilities ?? obj.probs) as Record<string, unknown> | undefined;
  if (probs && typeof probs === "object") {
    for (const value of Object.values(probs)) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

/** Laya の batch 応答（answers 配列）を `path → noul` の map にする。 */
export function adaptBatchAnswers(
  answers: unknown,
  paths: string[]
): Map<string, number> {
  const out = new Map<string, number>();
  const list = Array.isArray(answers)
    ? answers
    : answers && typeof answers === "object"
      ? Object.entries(answers as Record<string, unknown>)
      : [];
  const entries = Array.isArray(list) ? list : [];
  entries.forEach((entry: unknown, index: number) => {
    let value: unknown = entry;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const obj = entry as Record<string, unknown>;
      if ("answer" in obj) value = obj.answer;
    }
    out.set(paths[index] ?? String(index), parseNoulScore(value));
  });
  return out;
}

export interface PickFilesResult {
  /** repoMap に実在するパスだけ、元の順序を保って返す。 */
  picked: string[];
  /** 選択できず、呼び出し側のフォールバックが必要か。 */
  needsFallback: boolean;
}

/**
 * ローカル Laya に関連ファイルを選択させる（`POST /v1/systemone/batch`）。
 * 1 state = 1 候補パス。最大 64 件/リクエスト。超えた分は先頭に絞る。
 * 404（古い laya-serve）・失敗・0 件の場合は needsFallback=true。
 */
async function pickFilesByLaya(opts: {
  ai: AiProvider;
  repoMap: string[];
  query: string;
  limit: number;
  local: LocalDecisionConfig;
}): Promise<PickFilesResult> {
  const paths = opts.repoMap.slice(0, LAYA_FILE_BATCH_LIMIT);
  const url = `${opts.local.url.replace(/\/+$/, "")}/v1/systemone/batch`;
  const question: Record<string, AiClefQuestion> = {
    needed: {
      type: "noul",
      instructions:
        "このファイルはタスクを実装するために読む必要があるか。必要なら 1、不要なら 0 に近い確率で答えよ。",
    },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.local.model,
        states: paths,
        questions: { needed: { type: "noul", instructions: question.needed.instructions } },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { picked: [], needsFallback: true };
    const data = (await res.json()) as { answers?: unknown };
    const scored = adaptBatchAnswers(data.answers, paths);
    const picked = paths
      .map((path) => ({ path, score: scored.get(path) ?? 0 }))
      .filter((row) => row.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit)
      .map((row) => row.path);
    return { picked, needsFallback: picked.length === 0 };
  } catch (err) {
    console.warn(
      "[retrieval] local file selection failed, using text model:",
      err instanceof Error ? err.message : err
    );
    return { picked: [], needsFallback: true };
  }
}

/**
 * 関連ファイルを選択させる。インデックスを持たないため検索の入口になる。
 * local backend が有効なら Laya の batch 判定を試し、失敗時はテキストモデルに戻す。
 *
 * - 返答に repoMap に無いパスが混ざっても除去する
 * - 1 件も採用できなかった場合は needsFallback で呼び出し側へ委ねる
 */
export async function pickFilesByLuna(opts: {
  ai: AiProvider;
  repoMap: string[];
  query: string;
  maxFiles?: number;
  /** ローカル Laya を使う設定（fileSelection=true のときだけ有効）。 */
  local?: LocalDecisionConfig & { fileSelection: boolean };
}): Promise<PickFilesResult> {
  const limit = Math.min(opts.maxFiles ?? FILE_PICK_MAX, FILE_PICK_MAX);
  if (opts.repoMap.length === 0 || limit <= 0 || !opts.query.trim()) {
    return { picked: [], needsFallback: true };
  }

  if (opts.local?.fileSelection) {
    const local = await pickFilesByLaya({
      ai: opts.ai,
      repoMap: opts.repoMap,
      query: opts.query,
      limit,
      local: opts.local,
    });
    if (!local.needsFallback) return local;
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
