import type { FindingGroup } from "../types";

export interface HealingUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface HealingSummaryPr {
  number: number;
  title?: string;
  branch?: string;
  url?: string;
}

export interface HealingSummary {
  error?: string;
  canceled?: boolean;
  at?: number;
  index?: {
    files: number;
    chunks: number;
    commitSha?: string;
    error?: string;
    usage?: HealingUsage;
  };
  analysis?: {
    overall: number;
    grade: string;
    breakdown: Record<string, number>;
    findingCount: number;
    autoFixableCount: number;
    summary: string;
    instruction?: string;
    usage?: HealingUsage;
  };
  groups?: FindingGroup[];
  prsCreated?: number;
  prs?: Array<HealingSummaryPr | number>;
  fix?: { usage?: HealingUsage };
}

export function parseHealingSummary(raw: string | null | undefined): HealingSummary {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as HealingSummary) : {};
  } catch {
    return {};
  }
}

export function mergeHealingSummary(
  raw: string | null | undefined,
  patch: HealingSummary
): string {
  const prev = parseHealingSummary(raw);
  return JSON.stringify({
    ...prev,
    ...patch,
    index: patch.index ? { ...prev.index, ...patch.index } : prev.index,
    analysis: patch.analysis ? { ...prev.analysis, ...patch.analysis } : prev.analysis,
    fix: patch.fix ? { ...prev.fix, ...patch.fix } : prev.fix,
  });
}

export function usageTotals(summary: HealingSummary): {
  analyze: HealingUsage;
  fix: HealingUsage;
} {
  const zero: HealingUsage = { model: "", promptTokens: 0, completionTokens: 0 };
  const index = summary.index?.usage;
  const analysis = summary.analysis?.usage;
  return {
    analyze: {
      model: analysis?.model || index?.model || "",
      promptTokens: (index?.promptTokens ?? 0) + (analysis?.promptTokens ?? 0),
      completionTokens: (index?.completionTokens ?? 0) + (analysis?.completionTokens ?? 0),
    },
    fix: summary.fix?.usage ?? zero,
  };
}
