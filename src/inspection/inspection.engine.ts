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

const ASPECT_LIST = ASPECTS.join(", ");

const COMPACT_JSON_SHAPE = `{
  "summary": "2-4文の日本語サマリー",
  "files": [{
    "path": "file.ts",
    "scoreBreakdown": { "<aspectId>": { "score": 0-100, "summary": "一文" } },
    "findings": [{ "id": "string", "category": "security|performance|redundancy|readability|design|correctness", "severity": "critical|high|medium|low|info", "title": "string", "description": "string", "startLine": 1, "endLine": 1, "snippet": "string", "impact": "string", "scorePenalty": 0-30 }],
    "recommendations": [{ "findingId": "string", "title": "string", "before": "string", "after": "string", "rationale": "string", "impactDescription": "string", "effort": "trivial|minor|moderate|major" }]
  }]
}`;

const BATCH_CHAR_BUDGET = 24_000;

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
    const contentHash = await computeContentHash(processedFiles);

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
    const totalChars = request.files.reduce((n, f) => n + f.content.length, 0);
    const tryBatch = request.files.length > 1 && totalChars <= BATCH_CHAR_BUDGET;

    if (tryBatch || request.files.length === 1) {
      try {
        return await this.callAIOnce(request);
      } catch (err) {
        if (request.files.length === 1) throw err;
        console.warn("[InspectionEngine] batched analysis failed, falling back per-file:", err);
      }
    }

    const files: AIFileAnalysis[] = [];
    const summaries: string[] = [];
    let lastError: unknown;

    for (const file of request.files) {
      try {
        const fileOut = await this.callAIOnce({ ...request, files: [file] });
        if (fileOut.files.length > 0) files.push(...fileOut.files);
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

  private async callAIOnce(request: InspectionRequest): Promise<AIInspectionOutput> {
    const userPrompt = buildUserPrompt(request);
    const granularity = request.options?.granularity ?? "file";
    const functionsHint =
      granularity === "function"
        ? `\nInclude a "functions" array per file with name, startLine, endLine, scoreBreakdown, findings, recommendations.`
        : "";
    const system = `${SYSTEM_PROMPT}

Respond with ONLY a JSON object matching this shape:
${COMPACT_JSON_SHAPE}
scoreBreakdown MUST include every aspect id: ${ASPECT_LIST}
files.length MUST be ${request.files.length}.${functionsHint}`;

    const maxTokens = Math.min(
      this.config.ai.maxTokens,
      2048 + Math.ceil(request.files.reduce((n, f) => n + f.content.length, 0) / 2)
    );

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.ai.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(1000 * attempt);
        console.warn(`[InspectionEngine] retry ${attempt}/${this.config.ai.maxRetries}`);
      }
      try {
        const text = await this.ai.complete({
          model: this.config.ai.model,
          maxTokens,
          system,
          prompt: userPrompt,
        });
        const cleaned = (text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned) as AIInspectionOutput;
        if (!parsed.files?.length) throw new Error("AI analysis produced no file results");
        return parsed;
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
