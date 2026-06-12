/**
 * ouroboros – AI-driven code inspection & scoring system
 * Phase 1: Core data model definitions
 */

// ─── Shared primitives ────────────────────────────────────────────────────────

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "csharp"
  | "cpp"
  | "ruby"
  | "flutter";

/** Grade derived from the overall score */
export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

/** 0–100 inclusive */
export type Score = number;

/** Human-readable effort estimate for applying a recommendation */
export type RecommendationEffort = "trivial" | "minor" | "moderate" | "major";

// ─── Inspection request ───────────────────────────────────────────────────────

export interface InspectionFile {
  /** Relative path from project root */
  path: string;
  content: string;
}

export interface InspectionOptions {
  /** Granularity at which scores and findings are reported */
  granularity: "file" | "function";
  /** Score categories to evaluate (all enabled when omitted) */
  enabledCategories?: InspectionCategory[];
  /** Trigger webhook notifications only when these thresholds are breached */
  scoreThresholds?: ScoreThresholds;
}

export interface ScoreThresholds {
  overall?: Score;
  security?: Score;
  performance?: Score;
  redundancy?: Score;
  readability?: Score;
  design?: Score;
  correctness?: Score;
}

export interface InspectionRequest {
  id: string;
  /** Business/project context fed to the AI for better interpretation */
  projectContext?: string;
  language: Language;
  files: InspectionFile[];
  options?: InspectionOptions;
  requestedAt: string; // ISO 8601
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * The six evaluation dimensions.
 * "security"    – injection, authn/authz, secret handling, dangerous APIs, input validation
 * "performance" – Big-O optimisation, needless allocation, I/O & async patterns
 * "redundancy"  – duplication, dead code, over-engineering
 * "readability" – cognitive complexity, naming, modern idiom usage
 * "design"      – design-pattern validity, coupling/cohesion, single responsibility
 * "correctness" – business-logic vs. intent alignment, edge cases
 */
export type InspectionCategory =
  | "security"
  | "performance"
  | "redundancy"
  | "readability"
  | "design"
  | "correctness";

export interface ScoreDimension {
  /** 0–100 */
  score: Score;
  /** Fraction of the overall score this dimension contributes (0–1, all dims sum to 1) */
  weight: number;
  /** One-sentence assessment of this dimension */
  summary: string;
}

export type ScoreBreakdown = Record<InspectionCategory, ScoreDimension>;

export interface ScoreCard {
  /** Weighted sum of all dimension scores, 0–100 */
  overall: Score;
  grade: Grade;
  breakdown: ScoreBreakdown;
}

// ─── Findings ────────────────────────────────────────────────────────────────

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface CodeLocation {
  file: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  /** Extracted source snippet for display */
  snippet: string;
}

export interface InspectionFinding {
  id: string;
  category: InspectionCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  location: CodeLocation;
  /** Why this matters: performance, safety, maintainability impact */
  impact: string;
  /** How many score points this finding deducts from its category score */
  scorePenalty: number;
  /** Whether a concrete Recommendation exists for this finding */
  hasRecommendation: boolean;
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export interface Recommendation {
  id: string;
  findingId: string;
  title: string;
  /** Original problematic code */
  before: string;
  /** Improved replacement */
  after: string;
  /** Unified diff (GNU diff -u format) */
  diff: string;
  /** Technical rationale: what changed and why */
  rationale: string;
  /** Concrete impact on performance, maintainability, etc. */
  impactDescription: string;
  effort: RecommendationEffort;
}

// ─── Per-file result ─────────────────────────────────────────────────────────

export interface FunctionResult {
  /** Fully-qualified function/method name */
  name: string;
  location: CodeLocation;
  scoreCard: ScoreCard;
  findings: InspectionFinding[];
  recommendations: Recommendation[];
}

export interface FileResult {
  path: string;
  scoreCard: ScoreCard;
  findings: InspectionFinding[];
  recommendations: Recommendation[];
  /** Populated when granularity === "function" */
  functions?: FunctionResult[];
}

// ─── Refactoring candidates (heuristic selection) ────────────────────────────

export type RefactorPriority = "critical" | "high" | "medium" | "low";

/**
 * A method/class (granularity "function") or file (granularity "file") that the
 * heuristic selector judged worth refactoring, ranked by priorityScore.
 */
export interface RefactorCandidate {
  unit: "function" | "file";
  /** Function/method/class name, or the file path for file-level candidates */
  name: string;
  location: CodeLocation;
  scoreCard: ScoreCard;
  priority: RefactorPriority;
  /** Heuristic composite score — higher means more urgent to refactor */
  priorityScore: number;
  /** Dimensions whose score fell below the configured threshold, worst first */
  weakestDimensions: InspectionCategory[];
  /** Recommendations belonging to this unit */
  recommendations: Recommendation[];
  /** One-sentence justification for why this unit was selected */
  rationale: string;
}

// ─── Top-level inspection result ────────────────────────────────────────────

export interface InspectionResult {
  /** Unique identifier for this result */
  id: string;
  requestId: string;
  /** ISO 8601 */
  completedAt: string;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  language: Language;
  /** Aggregate score over all files */
  scoreCard: ScoreCard;
  /** All findings across all files, ordered by severity then scorePenalty */
  findings: InspectionFinding[];
  /** All recommendations across all files */
  recommendations: Recommendation[];
  /** Per-file breakdown */
  files: FileResult[];
  /** Heuristically selected refactoring targets, ordered by priorityScore desc */
  refactorCandidates: RefactorCandidate[];
  /** 2–4 sentence executive summary in the project's language */
  summary: string;
  /** AI model identifier used for this run */
  aiModel: string;
  /** Cached AST digest; used to skip re-analysis on identical content */
  contentHash: string;
}

// ─── Webhook payload ─────────────────────────────────────────────────────────

export type WebhookEvent =
  | "inspection.completed"
  | "inspection.threshold_breached"
  | "inspection.failed";

export interface WebhookThresholdBreach {
  category: InspectionCategory | "overall";
  threshold: Score;
  actual: Score;
}

/** Abbreviated score card used in webhook payloads to keep payload size small */
export interface WebhookScoreCard {
  overall: Score;
  grade: Grade;
}

export interface WebhookPayload {
  event: WebhookEvent;
  /** ISO 8601 */
  triggeredAt: string;
  inspection: {
    id: string;
    language: Language;
    scoreCard: WebhookScoreCard;
    summary: string;
    findingCount: number;
    recommendationCount: number;
    /** Deep-link into the WebUI for this result */
    url?: string;
  };
  /** Only present for inspection.threshold_breached events */
  breaches?: WebhookThresholdBreach[];
  /** Only present for inspection.failed events */
  error?: string;
}

// ─── Historical record (database row shape) ──────────────────────────────────

export interface InspectionRecord {
  id: string;
  projectId: string;
  requestId: string;
  completedAt: string;
  language: Language;
  overallScore: Score;
  grade: Grade;
  findingCount: number;
  recommendationCount: number;
  /** Full InspectionResult stored as JSONB */
  result: InspectionResult;
}
