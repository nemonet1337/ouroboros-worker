import type { Patch } from "../types";

/** markdown フェンスと reasoning 前文を剥がして patches JSON を取り出す。 */
export function parseGeneratedPatches(raw: string): { patches: Patch[]; error?: string } {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const candidates = [cleaned];
  const braceStart = cleaned.indexOf("{");
  const braceEnd = cleaned.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(cleaned.slice(braceStart, braceEnd + 1));
  }
  const bracketStart = cleaned.indexOf("[");
  const bracketEnd = cleaned.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    candidates.push(cleaned.slice(bracketStart, bracketEnd + 1));
  }

  let lastErr = `AI 応答の JSON パースに失敗しました: ${cleaned.slice(0, 200)}`;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { patches?: unknown } | unknown[];
      if (Array.isArray(parsed)) return { patches: parsed as Patch[] };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.patches)) {
        return { patches: parsed.patches as Patch[] };
      }
      lastErr = "AI の応答に patches 配列が含まれていませんでした。";
    } catch {
      // try next candidate
    }
  }
  return { patches: [], error: lastErr };
}
