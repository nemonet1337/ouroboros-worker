import { createPatch } from "diff";
import type { AiProvider } from "../ports/ai";
import {
  FileResult,
  FunctionResult,
  InspectionAspect,
  InspectionCategory,
  InspectionFinding,
  InspectionRequest,
  InspectionResult,
  Recommendation,
} from "../types";
import {
  InspectionConfig,
  defaultInspectionConfig,
  deriveCategoryWeights,
} from "../config/inspection.config";
import { computeContentHash, preprocessFiles } from "./preprocessor";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt.builder";
import { aggregateScoreCards, calculateScoreCard } from "./score.calculator";
import { selectRefactorCandidates } from "./refactor.selector";
import { ASPECTS } from "./aspects";

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
  scoreBreakdown: Record<InspectionAspect, { score: number; summary: string }>;
  findings: AIFinding[];
  recommendations: AIRecommendation[];
}

interface AIFileAnalysis {
  path: string;
  scoreBreakdown: Record<InspectionAspect, { score: number; summary: string }>;
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

const ASPECT_NAMES: string[] = ASPECTS;

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
  required: ASPECT_NAMES,
  properties: Object.fromEntries(ASPECT_NAMES.map((a) => [a, scoreDimSchema])),
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
    config: Partial<InspectionConfig> = {}
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

    const weights = this.config.scoring.weights;

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
        // Refactor selection operates on the 6-category rollup.
        weights: deriveCategoryWeights(weights),
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

    return result;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private buildFileResult(
    fa: AIFileAnalysis,
    weights: Record<InspectionAspect, number> = this.config.scoring.weights
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
    // ファイル単位で小さな JSON スキーマの解析を複数回に分割する。
    // （32 観点 × 全ファイルの巨大 JSON を一発生成すると弱いモデルで parse に失敗するため）
    const files: AIFileAnalysis[] = [];
    const summaries: string[] = [];
    let lastError: unknown;

    for (const file of request.files) {
      try {
        const fileOut = await this.callAIForFile({ ...request, files: [file] }, file.path);
        if (fileOut.files.length > 0) {
          files.push(...fileOut.files);
        }
        if (fileOut.summary) summaries.push(fileOut.summary);
      } catch (err) {
        lastError = err;
        console.error(`[InspectionEngine] file analysis failed for ${file.path}:`, err);
      }
    }

    if (files.length === 0) {
      throw lastError ?? new Error("AI analysis produced no file results");
    }

    return {
      summary: summaries.join(" ").slice(0, 2000) || "解析が完了しました。",
      files,
    };
  }

  private async callAIForFile(request: InspectionRequest, path: string): Promise<AIInspectionOutput> {
    const userPrompt = buildUserPrompt(request);
    const system = `${SYSTEM_PROMPT}

You are analyzing a SINGLE file (${path}).
You MUST respond with ONLY a single valid JSON object (no markdown fences, no preamble)
matching this JSON schema:
${JSON.stringify(INSPECTION_TOOL.input_schema)}
The "files" array MUST contain exactly one entry for this file.`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.ai.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(1000 * attempt);
        console.warn(`[InspectionEngine] retry ${attempt}/${this.config.ai.maxRetries} for ${path}`);
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
        console.error(`[InspectionEngine] attempt ${attempt + 1} failed for ${path}:`, err);
      }
    }

    throw lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
