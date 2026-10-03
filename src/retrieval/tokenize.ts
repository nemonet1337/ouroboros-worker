/**
 * 検索用のトークナイザ。日本語は空白で分かれないため Intl.Segmenter に任せる。
 * 識別子（healing, auth など）はそのまま残し、機械noise は捨てる。
 */

let segmenter: Intl.Segmenter | null | undefined;

/** Intl.Segmenter が使えない環境では null を返す（呼び出し側で ASCII のみに退化）。 */
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  } catch {
    segmenter = null;
  }
  return segmenter;
}

const ASCII_TOKEN = /[a-z0-9_]+/g;
const SEGMENTER_MIN_LENGTH = 2;

/**
 * 小文字化した検索語を返す。重複は除去し、1 文字の語は捨てる。
 * 日本語が混ざった文字列でも ASCII 部分（識別子）は必ず残る。
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const out = new Set<string>();
  for (const m of lower.matchAll(ASCII_TOKEN)) {
    if (m[0].length >= SEGMENTER_MIN_LENGTH) out.add(m[0]);
  }
  const seg = getSegmenter();
  if (seg) {
    for (const part of seg.segment(lower)) {
      if (!part.isWordLike) continue;
      // 識別子は ASCII 側で取れているので、ここでは非 ASCII のみ採る
      if (SEGMENTER_MIN_LENGTH > part.segment.length) continue;
      if (!/[^\x00-\x7f]/.test(part.segment)) continue;
      out.add(part.segment);
    }
  }
  return [...out];
}
