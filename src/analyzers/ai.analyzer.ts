import {
  AnalysisResult,
  AllFindings,
  FindingGroup,
  StaticAnalysisFinding,
  DependencyFinding,
  PerformanceFinding,
  SecretFinding,
  Priority,
  Language,
  Framework,
} from "../types";
import { HealingConfig } from "../config/healing.config";
import type { AiProvider } from "../ports/ai";

type AnyFinding = StaticAnalysisFinding | DependencyFinding | PerformanceFinding | SecretFinding;

interface AIGroup {
  id: string;
  priority: Priority;
  findingIndices: number[];
  autoFixable: boolean;
  estimatedRisk: string;
  fixStrategy: { title: string; steps: string[]; rationale: string };
  language: Language | null;
  framework: Framework | null;
}

interface AIResponse {
  groups: AIGroup[];
  summary: string;
  riskScore: number;
  estimatedFixTime: number;
}

const SYSTEM_PROMPT = `You are an expert security engineer and code quality analyst.
Analyze findings from multiple scanners and produce a structured action plan.

Output ONLY a valid JSON object with this schema (no markdown, no preamble):
{
  "groups": [
    {
      "id": "unique-kebab-case-id",
      "priority": "critical|high|medium|low|info",
      "findingIndices": [0, 1, 2],
      "autoFixable": true,
      "estimatedRisk": "one sentence in Japanese",
      "fixStrategy": {
        "title": "concise title in Japanese",
        "steps": ["step1 in Japanese", "step2"],
        "rationale": "rationale in Japanese"
      },
      "language": "go|typescript|javascript|rust|flutter|java|python|ruby|csharp|cpp|null",
      "framework": "gin|react|nextjs|spring-boot|django|fastapi|rails|aspnet-core|null"
    }
  ],
  "summary": "2-3 sentences in Japanese",
  "riskScore": 0,
  "estimatedFixTime": 0
}

RULES:
- Secret findings: NEVER autoFixable (requires manual rotation).
- Dependency patch updates, no breaking changes: autoFixable=true.
- Static-analysis injection/XSS with clear fix: autoFixable=true.
- Performance findings: autoFixable=false.
- MAX 10 groups. Merge similar findings.
- findingIndices references the flat array: static-analysis findings first, then dependency, performance, secrets.`;

export class AIAnalyzer {
  constructor(
    private readonly config: HealingConfig,
    private readonly ai: AiProvider
  ) {}

  async analyze(findings: AllFindings, codeContext?: string): Promise<AnalysisResult> {
    const flat: AnyFinding[] = [
      ...findings.staticAnalysis,
      ...findings.dependency,
      ...findings.performance,
      ...findings.secrets,
    ];

    if (flat.length === 0) {
      return { groups: [], summary: "スキャン結果: 問題は検出されませんでした。", riskScore: 0, estimatedFixTime: 0 };
    }

    // Limit per category to avoid token overflow
    const truncated = [
      ...findings.staticAnalysis.slice(0, 30),
      ...findings.dependency.slice(0, 30),
      ...findings.performance.slice(0, 30),
      ...findings.secrets.slice(0, 30),
    ];

    const prompt = `Analyze these security and code quality findings and produce the JSON action plan.

Detected frameworks: ${findings.detectedFrameworks.join(", ") || "none"}

Findings (${truncated.length} total, flat array indexed from 0):
${JSON.stringify(truncated, null, 2)}${codeContext ? `

Relevant code (vector index):
${codeContext}` : ""}`;

    try {
      const text = await this.ai.complete({
        model: this.config.ai.model,
        maxTokens: 4096,
        system: SYSTEM_PROMPT,
        prompt,
      });

      const parsed = JSON.parse((text || "{}").replace(/```json|```/g, "").trim()) as AIResponse;

      const groups: FindingGroup[] = parsed.groups.map((g) => ({
        id: g.id,
        priority: g.priority,
        findings: g.findingIndices.map((i) => flat[i]).filter(Boolean),
        autoFixable: g.autoFixable,
        estimatedRisk: g.estimatedRisk,
        fixStrategy: g.fixStrategy,
        language: g.language ?? undefined,
        framework: g.framework ?? undefined,
      }));

      return {
        groups,
        summary: parsed.summary,
        riskScore: Math.min(100, Math.max(0, parsed.riskScore)),
        estimatedFixTime: parsed.estimatedFixTime,
      };
    } catch (err) {
      console.error("[AIAnalyzer] AI call failed, using fallback:", err);
      return this.fallback(findings);
    }
  }

  private fallback(findings: AllFindings): AnalysisResult {
    const groups: FindingGroup[] = [];

    // Critical dependency vulnerabilities
    const criticalDeps = findings.dependency.filter((d) =>
      d.vulnerabilities.some((v) => v.severity === "critical")
    );
    for (const dep of criticalDeps.slice(0, 5)) {
      groups.push({
        id: `fallback-dep-${dep.packageName}`,
        priority: "critical",
        findings: [dep],
        autoFixable: !dep.breakingChanges && dep.updateType !== "major",
        estimatedRisk: "既知の重大な脆弱性を持つ依存関係が検出されました。",
        fixStrategy: {
          title: `${dep.packageName} を ${dep.latestVersion} に更新`,
          steps: [`${dep.manifestFile ?? "マニフェスト"} のバージョンを更新`, "依存関係を再インストール", "テストを実行"],
          rationale: dep.vulnerabilities.map((v) => v.id).join(", "),
        },
      });
    }

    // Critical/high static-analysis findings
    const criticalStatic = findings.staticAnalysis.filter(
      (f) => f.severity === "critical" || f.severity === "high"
    );
    for (const finding of criticalStatic.slice(0, 5)) {
      groups.push({
        id: `fallback-sast-${finding.ruleId}-${finding.line ?? 0}`,
        priority: finding.severity === "critical" ? "critical" : "high",
        findings: [finding],
        autoFixable: false,
        estimatedRisk: `静的解析が ${finding.ruleId} を検出しました。`,
        fixStrategy: {
          title: `静的解析: ${finding.ruleId} を修正`,
          steps: [`${finding.file}:${finding.line ?? "?"} を確認`, "指摘内容に従って修正", "テストを実行"],
          rationale: finding.message,
        },
      });
    }

    const riskScore = criticalDeps.length > 0 || criticalStatic.length > 0 ? 80 : 20;

    return {
      groups: groups.slice(0, 10),
      summary: `フォールバック解析: ${findings.dependency.length} 件の依存関係、${findings.staticAnalysis.length} 件の静的解析問題を検出。`,
      riskScore,
      estimatedFixTime: groups.length * 30,
    };
  }
}
