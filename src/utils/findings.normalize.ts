/**
 * Legacy runner findings normalizer kept for tests that still exercise
 * old wire formats. Production path (RepoRunner) emits AllFindings directly.
 */
import type { AllFindings, StaticAnalysisFinding, Priority } from "../types";

function mapSeverity(s: string): Priority {
  if (s === "error" || s === "critical") return s === "error" ? "high" : "critical";
  if (s === "warning" || s === "high") return s === "warning" ? "medium" : "high";
  if (s === "note" || s === "info") return "info";
  if (s === "medium" || s === "low") return s;
  return "medium";
}

export function normalizeAllFindings(raw: Record<string, unknown>): AllFindings {
  const staticSrc =
    (raw.staticAnalysis as unknown[]) ??
    (raw.codeql as unknown[]) ??
    [];
  const staticAnalysis: StaticAnalysisFinding[] = staticSrc.map((f: any, i) => ({
    id: String(f.id ?? f.ruleId ?? `finding-${i}`),
    ruleId: String(f.ruleId ?? f.id ?? "unknown"),
    title: String(f.title ?? f.ruleId ?? "finding"),
    message: String(f.message ?? ""),
    severity: mapSeverity(String(f.severity ?? "medium")),
    file: String(f.file ?? f.location?.file ?? ""),
    line: f.line ?? f.location?.startLine,
  }));

  const licensesRaw = raw.licenses;
  const licenses: AllFindings["licenses"] = Array.isArray(licensesRaw)
    ? licensesRaw.map((l: any) =>
        typeof l === "string"
          ? {
              type: "license" as const,
              file: l,
              packageName: "",
              license: "UNKNOWN",
              status: "unknown" as const,
              description: l,
            }
          : {
              type: "license" as const,
              file: String(l?.file ?? l?.name ?? ""),
              packageName: String(l?.packageName ?? ""),
              license: String(l?.license ?? l?.spdxId ?? "UNKNOWN"),
              status: (l?.status ?? "unknown") as "forbidden" | "unknown" | "allowed",
              description: String(l?.description ?? ""),
            }
      )
    : [];

  return {
    staticAnalysis,
    dependency: (raw.dependency as AllFindings["dependency"]) ?? [],
    performance: (raw.performance as AllFindings["performance"]) ?? [],
    secrets: (raw.secrets as AllFindings["secrets"]) ?? [],
    licenses,
    detectedFrameworks: (raw.detectedFrameworks as AllFindings["detectedFrameworks"]) ?? [],
    timestamp: new Date(),
    commitHash: String(raw.commitHash ?? ""),
  };
}
