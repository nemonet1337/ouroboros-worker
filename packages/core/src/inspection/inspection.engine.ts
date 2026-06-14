import { createPatch } from "diff";
import type { AiProvider } from "../ports/ai";
import {
  FileResult,
  FunctionResult,
  InspectionCategory,
  InspectionFinding,
  InspectionRequest,
  InspectionResult,
  Recommendation,
} from "../types/inspection.types";
import {
  InspectionConfig,
  defaultInspectionConfig,
} from "../config/inspection.config";
import { computeContentHash, preprocessFiles } from "./preprocessor";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.builder";
import { aggregateScoreCards, calculateScoreCard } from "./score.calculator";
import { selectRefactorCandidates } from "./refactor.selector";
import type { WeightAdvisor } from "./weight.advisor";

// ─── Internal AI response types ──────────────────────────────────────────────

interface AIFinding {
  id: string;
  category: InspectionCategory;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  startLine: number;
  endLine: number;
  snippet: string;
  impact: string;
  scorePenalty: number;
}

interface AIRecommendation {
  findingId: string;
  title: string;
  before: string;
  after: string;
  rationale: string;
  impactDescription: string;
  effort: "trivial" | "minor" | "moderate" | "major";
}

interface AIFunctionAnalysis {
  name: string;
  startLine: number;
  endLine: number;
  scoreBreakdown: Record<InspectionCategory, { score: number; summary: string }>;
  findings: AIFinding[];
  recommendations: AIRecommendation[];
}

interface AIFileAnalysis {
  path: string;
  scoreBreakdown: Record<InspectionCategory, { score: number; summary: string }>;
  findings: AIFinding[];
  recommendations: AIRecommendation[];
  /** Present when function-level granularity was requested */
  functions?: AIFunctionAnalysis[];
}

interface AIInspectionOutput {
  summary: string;
  files: AIFileAnalysis[];
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const CATEGORY_NAMES = [
  "security",
  "performance",
  "redundancy",
  "readability",
  "design",
  "correctness",
];

const scoreDimSchema = {
  type: "object",
  required: ["score", "summary"],
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    summary: { type: "string" },
  },
};

const scoreBreakdownSchema = {
  type: "object",
  required: CATEGORY_NAMES,
  properties: Object.fromEntries(CATEGORY_NAMES.map((c) => [c, scoreDimSchema])),
};

const findingsSchema = {
  type: "array",
  items: {
    type: "object",
    required: [
      "id",
      "category",
      "severity",
      "title",
      "description",
      "startLine",
      "endLine",
      "snippet",
      "impact",
      "scorePenalty",
    ],
    properties: {
      id: { type: "string" },
      category: { type: "string", enum: CATEGORY_NAMES },
      severity: {
        type: "string",
        enum: ["critical", "high", "medium", "low", "info"],
      },
      title: { type: "string" },
      description: { type: "string" },
      startLine: { type: "integer", minimum: 1 },
      endLine: { type: "integer", minimum: 1 },
      snippet: { type: "string" },
      impact: { type: "string" },
      scorePenalty: { type: "number", minimum: 0, maximum: 30 },
    },
  },
};

const recommendationsSchema = {
  type: "array",
  items: {
    type: "object",
    required: [
      "findingId",
      "title",
      "before",
      "after",
      "rationale",
      "impactDescription",
      "effort",
    ],
    properties: {
      findingId: { type: "string" },
      title: { type: "string" },
      before: { type: "string" },
      after: { type: "string" },
      rationale: { type: "string" },
      impactDescription: { type: "string" },
      effort: {
        type: "string",
        enum: ["trivial", "minor", "moderate", "major"],
      },
    },
  },
};

const INSPECTION_TOOL = {
  name: "submit_inspection",
  description:
    "コードインスペクションの完全な分析結果を提出します。すべてのファイルの分析が完了したら必ず呼び出してください。",
  input_schema: {
    type: "object",
    required: ["summary", "files"],
    properties: {
      summary: {
        type: "string",
        description: "2〜4文の総合評価サマリー（日本語）",
      },
      files: {
        type: "array",
        description: "各ファイルの分析結果",
        items: {
          type: "object",
          required: ["path", "scoreBreakdown", "findings", "recommendations"],
          properties: {
            path: { type: "string" },
            scoreBreakdown: scoreBreakdownSchema,
            findings: findingsSchema,
            recommendations: recommendationsSchema,
            functions: {
              type: "array",
              description:
                "粒度が function のときのみ: 関数・メソッド・クラス単位の分析結果",
              items: {
                type: "object",
                required: [
                  "name",
                  "startLine",
                  "endLine",
                  "scoreBreakdown",
                  "findings",
                  "recommendations",
                ],
                properties: {
                  name: { type: "string" },
                  startLine: { type: "integer", minimum: 1 },
                  endLine: { type: "integer", minimum: 1 },
                  scoreBreakdown: scoreBreakdownSchema,
                  findings: findingsSchema,
                  recommendations: recommendationsSchema,
                },
              },
            },
          },
        },
      },
    },
  },
};

// ─── Engine ───────────────────────────────────────────────────────────────────

export class InspectionEngine {
  private readonly config: InspectionConfig;

  constructor(
    private readonly ai: AiProvider,
    config: Partial<InspectionConfig> = {},
    private readonly weightAdvisor?: WeightAdvisor
  ) {
    this.config = {
      ...defaultInspectionConfig,
      ...config,
      ai: { ...defaultInspectionConfig.ai, ...config.ai },
      preprocessing: {
        ...defaultInspectionConfig.preprocessing,
        ...config.preprocessing,
      },
      scoring: {
        ...defaultInspectionConfig.scoring,
        ...config.scoring,
      },
      refactor: {
        ...defaultInspectionConfig.refactor,
        ...config.refactor,
      },
    };
  }

  async inspect(request: InspectionRequest): Promise<InspectionResult> {
    const startTime = Date.now();

    const processedFiles = preprocessFiles(
      request.files.slice(0, this.config.preprocessing.maxFiles),
      this.config.preprocessing.maxFileSizeBytes
    );
    const contentHash = computeContentHash(processedFiles);

    const weights = this.weightAdvisor
      ? await this.weightAdvisor.suggestWeights(this.config.scoring.weights)
      : this.config.scoring.weights;

    const aiOutput = await this.callAI({ ...request, files: processedFiles });

    const fileResults: FileResult[] = aiOutput.files.map((fa) =>
      this.buildFileResult(fa, weights)
    );

    const overallScoreCard = aggregateScoreCards(
      fileResults.map((f) => f.scoreCard),
      weights,
      this.config.scoring.gradeThresholds
    );

    const severityRank: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };
    const allFindings = fileResults
      .flatMap((f) => f.findings)
      .sort(
        (a, b) =>
          severityRank[a.severity] - severityRank[b.severity] ||
          b.scorePenalty - a.scorePenalty
      );

    const refactorCandidates = selectRefactorCandidates(
      { files: fileResults },
      {
        overallThreshold: this.config.refactor.overallThreshold,
        dimensionThreshold: this.config.refactor.dimensionThreshold,
        weights,
      }
    );

    const result: InspectionResult = {
      id: crypto.randomUUID(),
      requestId: request.id,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      language: request.language,
      scoreCard: overallScoreCard,
      findings: allFindings,
      recommendations: fileResults.flatMap((f) => f.recommendations),
      files: fileResults,
      refactorCandidates,
      summary: aiOutput.summary,
      aiModel: this.config.ai.model,
      contentHash,
    };

    // Non-blocking: store result in Vectorize for future weight suggestions.
    if (this.weightAdvisor) {
      this.weightAdvisor.store(result).catch(() => {});
    }

    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private buildFileResult(
    fa: AIFileAnalysis,
    weights: Record<InspectionCategory, number> = this.config.scoring.weights
  ): FileResult {
    const scoreCard = calculateScoreCard(
      fa.scoreBreakdown,
      weights,
      this.config.scoring.gradeThresholds
    );

    const findings = this.buildFindings(fa.path, fa.findings, fa.recommendations);
    const recommendations = this.buildRecommendations(fa.path, fa.recommendations);

    const functions: FunctionResult[] | undefined = fa.functions?.map((fn) => ({
      name: fn.name,
      location: {
        file: fa.path,
        startLine: fn.startLine,
        endLine: fn.endLine,
        snippet: "",
      },
      scoreCard: calculateScoreCard(
        fn.scoreBreakdown,
        weights,
        this.config.scoring.gradeThresholds
      ),
      findings: this.buildFindings(fa.path, fn.findings, fn.recommendations),
      recommendations: this.buildRecommendations(fa.path, fn.recommendations),
    }));

    return { path: fa.path, scoreCard, findings, recommendations, functions };
  }

  private buildFindings(
    path: string,
    aiFindings: AIFinding[],
    aiRecs: AIRecommendation[]
  ): InspectionFinding[] {
    const recFindingIds = new Set(aiRecs.map((r) => r.findingId));
    return aiFindings.map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      title: f.title,
      description: f.description,
      location: {
        file: path,
        startLine: f.startLine,
        endLine: f.endLine,
        snippet: f.snippet,
      },
      impact: f.impact,
      scorePenalty: f.scorePenalty,
      hasRecommendation: recFindingIds.has(f.id),
    }));
  }

  private buildRecommendations(path: string, aiRecs: AIRecommendation[]): Recommendation[] {
    return aiRecs.map((r) => ({
      id: crypto.randomUUID(),
      findingId: r.findingId,
      title: r.title,
      before: r.before,
      after: r.after,
      diff: createPatch(path, r.before, r.after),
      rationale: r.rationale,
      impactDescription: r.impactDescription,
      effort: r.effort,
    }));
  }

  private async callAI(request: InspectionRequest): Promise<AIInspectionOutput> {
    const userPrompt = buildUserPrompt(request);
    const system = `${SYSTEM_PROMPT}

You MUST respond with ONLY a single valid JSON object (no markdown fences, no preamble)
matching this JSON schema:
${JSON.stringify(INSPECTION_TOOL.input_schema)}`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.ai.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(1000 * attempt);
        console.warn(`[InspectionEngine] retry ${attempt}/${this.config.ai.maxRetries}`);
      }

      try {
        const text = await this.ai.complete({
          model: this.config.ai.model,
          maxTokens: this.config.ai.maxTokens,
          system,
          prompt: userPrompt,
        });
        const cleaned = (text || "").replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned) as AIInspectionOutput;
      } catch (err) {
        lastError = err;
        console.error(`[InspectionEngine] attempt ${attempt + 1} failed:`, err);
      }
    }

    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
