import type { AllFindings, StaticAnalysisFinding, Priority } from "../types";

/** 旧 CodeQLFinding（error|warning|note）→ Priority へのマッピング */
const LEGACY_SEVERITY: Record<string, Priority> = {
  error: "high",
  warning: "medium",
  note: "info",
};

const PRIORITIES = new Set<string>(["critical", "high", "medium", "low", "info"]);

function normalizeStaticFinding(raw: any): StaticAnalysisFinding {
  const legacyLocation = raw?.location as
    | { file?: string; startLine?: number }
    | undefined;
  const file: string = raw?.file ?? legacyLocation?.file ?? "";
  const line: number | undefined = raw?.line ?? legacyLocation?.startLine;
  const severity: Priority = PRIORITIES.has(raw?.severity)
    ? raw.severity
    : LEGACY_SEVERITY[raw?.severity] ?? "medium";
  const ruleId: string = raw?.ruleId ?? (typeof raw?.id === "string" ? raw.id.split("/")[0] : "unknown");

  return {
    id: raw?.id ?? `${ruleId}/${file}`,
    ruleId,
    title: raw?.title ?? raw?.message ?? ruleId,
    message: raw?.message ?? "",
    severity,
    file,
    line,
    cwe: raw?.cwe,
    language: raw?.language,
  };
}

/**
 * runner から受信したスキャン結果を現行の AllFindings 形状へ正規化する。
 * デプロイ済みの旧 runner は `codeql` キー + 旧 severity（error|warning|note）+
 * `location:{file,startLine}` を返すことがあるため、両形式を受理する。
 */
export function normalizeAllFindings(raw: any): AllFindings {
  const staticRaw: any[] = Array.isArray(raw?.staticAnalysis)
    ? raw.staticAnalysis
    : Array.isArray(raw?.codeql)
      ? raw.codeql
      : [];

  return {
    staticAnalysis: staticRaw.map(normalizeStaticFinding),
    dependency: Array.isArray(raw?.dependency) ? raw.dependency : [],
    performance: Array.isArray(raw?.performance) ? raw.performance : [],
    secrets: Array.isArray(raw?.secrets) ? raw.secrets : [],
    licenses: Array.isArray(raw?.licenses) ? raw.licenses : [],
    detectedFrameworks: Array.isArray(raw?.detectedFrameworks) ? raw.detectedFrameworks : [],
    timestamp: raw?.timestamp ? new Date(raw.timestamp) : new Date(),
    commitHash: raw?.commitHash ?? "",
  };
}
