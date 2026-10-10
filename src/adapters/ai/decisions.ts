import type {
  AiClefQuestion,
  AiDecisionRequest,
  AiDecisionResult,
  LocalDecisionConfig,
} from "../../ports/ai";

export const LAYA_STATE_LIMIT = 1500;
export const REMOTE_STATE_LIMIT = 8000;

function clampString(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * Jev / Laya の wire 形式へ質問を変換する。
 * `rubric` の値を数値 key 昇順の配列にする（score の場合のみ）。
 */
export function toWireQuestions(
  questions: Record<string, AiClefQuestion>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "score" && q.rubric) {
      const criteria = Object.entries(q.rubric)
        .map(([key, value]) => ({ key: Number(key), value }))
        .filter((e) => Number.isFinite(e.key))
        .sort((a, b) => a.key - b.key)
        .map((e) => e.value);
      out[name] = { type: "score", instructions: q.instructions, criteria };
    } else if (q.type === "choice") {
      out[name] = { type: "choice", instructions: q.instructions, criteria: q.criteria };
    } else {
      out[name] = { type: q.type, instructions: q.instructions };
    }
  }
  return out;
}

/**
 * score 回答を 1〜5 に正規化する。
 * Laya / Jev / OpenAI Decisions はいずれも level index 0 起点の確率重み平均を
 * 返すため、0〜4 は +1 して 1〜5 に寄せる（`solThreshold` と GUI 表示が 1〜5 前提）。
 * 形（オブジェクト / 数値）は保ち、`probabilities` の key も 1 起点に寄せる。
 */
export function normalizeScoreAnswer(answer: unknown): unknown {
  const clamp1to5 = (n: number): number => {
    if (!Number.isFinite(n)) return 3;
    if (n >= 0 && n <= 4) return n + 1;
    if (n >= 1 && n <= 5) return Math.trunc(n);
    return Math.max(1, Math.min(5, Math.round(n)));
  };

  const shiftProbabilities = (probs: Record<string, unknown>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(probs)) {
      const k = Number(key);
      const v = Number(value);
      if (!Number.isFinite(k) || !Number.isFinite(v)) continue;
      out[String(clamp1to5(k))] = v;
    }
    return out;
  };

  if (typeof answer === "number" || typeof answer === "string") {
    return { score: clamp1to5(Number(answer)) };
  }
  if (!answer || typeof answer !== "object") return { score: 3 };

  const obj = { ...(answer as Record<string, unknown>) };
  if (typeof obj.score === "number" || typeof obj.score === "string") {
    obj.score = clamp1to5(Number(obj.score));
  } else {
    obj.score = weightedScore(obj.probabilities ?? obj.probs) ?? 3;
  }
  const probs = obj.probabilities ?? obj.probs;
  if (probs && typeof probs === "object") {
    obj.probabilities = shiftProbabilities(probs as Record<string, unknown>);
  }
  return obj;
}

/** 確率重み平均から 1〜5 の score を組み立てる。 */
function weightedScore(probs: unknown): number | null {
  if (!probs || typeof probs !== "object") return null;
  let total = 0;
  let sum = 0;
  for (const [key, value] of Object.entries(probs as Record<string, unknown>)) {
    const k = Number(key);
    const p = Number(value);
    if (!Number.isFinite(k) || !Number.isFinite(p) || p <= 0) continue;
    total += p;
    // index 0 起点なので +1
    sum += p * (k >= 0 && k <= 4 ? k + 1 : k >= 1 && k <= 5 ? k : 3);
  }
  if (total <= 0) return null;
  return Math.max(1, Math.min(5, Math.round(sum / total)));
}

/** answer 配列（名前付き・無名前両対応）を `Record<name, answer>` に正規化する。 */
export function adaptAnswers(
  list: unknown,
  names: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(list)) {
    list.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") {
        out[names[i] ?? String(i)] = entry;
        return;
      }
      const obj = entry as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name : names[i] ?? String(i);
      out[name] = obj.answer !== undefined ? obj.answer : entry;
    });
    return out;
  }
  if (list && typeof list === "object") {
    return list as Record<string, unknown>;
  }
  return out;
}

/** score 質問だけを +1 正規化して answers を作り直す。 */
export function normalizeAnswers(
  answers: Record<string, unknown>,
  questions: Record<string, AiClefQuestion>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, q] of Object.entries(questions)) {
    const value = answers[name];
    out[name] = q.type === "score" ? normalizeScoreAnswer(value) : value;
  }
  return out;
}

/**
 * OpenAI Decisions API（限定プレビュー。モデルは `gpt-6-luna` のみ）。
 */
export async function decideOpenAI(
  model: string,
  req: AiDecisionRequest,
  apiKey: string
): Promise<AiDecisionResult> {
  const questions = Object.entries(req.questions).map(([name, q]) => ({
    name,
    ...toWireQuestions({ [name]: q })[name],
  }));
  const res = await fetch("https://api.openai.com/v1/decisions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: clampString(req.state, REMOTE_STATE_LIMIT),
      questions,
    }),
  });
  if (!res.ok) {
    throw new Error(`openai decisions failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { answers?: unknown } | null;
  const answers = adaptAnswers(data && data.answers, Object.keys(req.questions));
  return { answers: normalizeAnswers(answers, req.questions) };
}

/**
 * OpenRouter Decisions（alpha エンドポイント）。モデルは `typesafe/jev-1.13` 等。
 */
export async function decideOpenRouter(
  model: string,
  req: AiDecisionRequest,
  apiKey: string
): Promise<AiDecisionResult> {
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      state: clampString(req.state, REMOTE_STATE_LIMIT),
      questions: toWireQuestions(req.questions),
    }),
  });
  if (!res.ok) {
    throw new Error(`openrouter decisions failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { answers?: unknown } | null;
  const answers = adaptAnswers(data && data.answers, Object.keys(req.questions));
  return { answers: normalizeAnswers(answers, req.questions) };
}

/**
 * ローカル Laya（laya-serve）。Jev 互換の `POST /v1/systemone`。
 */
export async function decideLaya(
  cfg: LocalDecisionConfig,
  req: AiDecisionRequest,
  apiKey?: string
): Promise<AiDecisionResult> {
  const url = `${cfg.url.replace(/\/+$/, "")}/v1/systemone`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      state: clampString(req.state, LAYA_STATE_LIMIT),
      questions: toWireQuestions(req.questions),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`laya decision failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as { answers?: unknown } | null;
  const answers = adaptAnswers(data && data.answers, Object.keys(req.questions));
  return { answers: normalizeAnswers(answers, req.questions) };
}
