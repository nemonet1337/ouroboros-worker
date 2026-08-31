import type {
  AllFindings,
  FindingGroup,
  InspectionFinding,
  InspectionResult,
  Priority,
  SecretFinding,
  StaticAnalysisFinding,
} from "../types";

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low", "info"];

const MAX_GROUPS = 10;

function worsePriority(a: Priority, b: Priority): Priority {
  return PRIORITY_ORDER.indexOf(a) <= PRIORITY_ORDER.indexOf(b) ? a : b;
}

function asPriority(value: string | undefined): Priority {
  return (PRIORITY_ORDER as string[]).includes(value ?? "") ? (value as Priority) : "medium";
}

function inspectionToStatic(f: InspectionFinding): StaticAnalysisFinding {
  return {
    id: f.id,
    ruleId: f.category,
    title: f.title,
    message: f.description,
    severity: f.severity,
    file: f.location.file,
    line: f.location.startLine,
  };
}

function secretGroup(f: SecretFinding | StaticAnalysisFinding, index: number): FindingGroup {
  const file = "file" in f ? f.file : "";
  const title = "detector" in f ? `シークレット検出: ${f.detector}` : (f as StaticAnalysisFinding).title;
  return {
    id: `secret-${index}`,
    priority: "critical",
    findings: [f],
    autoFixable: false,
    estimatedRisk: "認証情報の漏洩。ローテーションが必要です。",
    fixStrategy: {
      title,
      steps: ["該当シークレットを無効化する", "新しい値をシークレットストアへ移す", "コード上の直書きを削除する"],
      rationale: "シークレットは自動修正せず、人手でローテーションする。",
    },
  };
}

/**
 * InspectionEngine の findings と regex スキャン結果から FindingGroup を組み立てる。
 * シークレットは常に autoFixable=false。
 */
export function groupsFromAnalysis(
  inspection: InspectionResult | null,
  scan: AllFindings | null,
  maxGroups = MAX_GROUPS
): FindingGroup[] {
  const byFile = new Map<string, { priority: Priority; findings: StaticAnalysisFinding[]; autoFixable: boolean; titles: string[] }>();

  const addStatic = (finding: StaticAnalysisFinding, autoFixable: boolean) => {
    const key = finding.file || "_unknown";
    const cur = byFile.get(key) ?? { priority: "info" as Priority, findings: [], autoFixable: false, titles: [] };
    cur.findings.push(finding);
    cur.priority = worsePriority(cur.priority, finding.severity);
    cur.autoFixable = cur.autoFixable || autoFixable;
    cur.titles.push(finding.title);
    byFile.set(key, cur);
  };

  for (const f of inspection?.findings ?? []) {
    addStatic(inspectionToStatic(f), f.hasRecommendation);
  }

  for (const f of scan?.staticAnalysis ?? []) {
    addStatic(f, f.severity === "critical" || f.severity === "high");
  }

  const groups: FindingGroup[] = [];
  for (const [file, cur] of byFile) {
    const title = cur.titles[0] ?? file;
    groups.push({
      id: `file-${file}`.replace(/[^a-zA-Z0-9._/-]+/g, "-").slice(0, 80),
      priority: cur.priority,
      findings: cur.findings,
      autoFixable: cur.autoFixable,
      estimatedRisk: `${file} に ${cur.findings.length} 件の指摘`,
      fixStrategy: {
        title,
        steps: [`${file} の指摘を修正する`],
        rationale: cur.findings.map((f) => f.message).slice(0, 3).join(" / "),
      },
    });
  }

  const secrets = scan?.secrets ?? [];
  for (let i = 0; i < secrets.length; i++) {
    const raw = secrets[i] as SecretFinding | StaticAnalysisFinding;
    groups.push(secretGroup(raw, i));
  }

  for (const dep of scan?.dependency ?? []) {
    const vulns = dep.vulnerabilities ?? [];
    if (vulns.length === 0) continue;
    const severity = asPriority(vulns[0]?.severity);
    groups.push({
      id: `dep-${dep.packageName}`.slice(0, 80),
      priority: severity,
      findings: [dep],
      autoFixable: dep.updateType !== "major" && !dep.breakingChanges,
      estimatedRisk: `${dep.packageName} に脆弱性 ${vulns.length} 件`,
      fixStrategy: {
        title: `${dep.packageName} を ${dep.latestVersion} へ更新`,
        steps: [`${dep.packageName} を ${dep.currentVersion} → ${dep.latestVersion} に上げる`],
        rationale: vulns.map((v) => v.id).join(", "),
      },
    });
  }

  groups.sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
  return groups.slice(0, maxGroups);
}
