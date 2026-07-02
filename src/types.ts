// ─── Language / Ecosystem / Framework primitives ─────────────────────────────

export type Language =
  | "typescript"
  | "javascript"
  | "rust"
  | "flutter"
  | "go"
  | "csharp"
  | "cpp"
  | "java"
  | "python"
  | "ruby";

export type Ecosystem =
  | "npm"
  | "yarn"
  | "pnpm"
  | "cargo"
  | "pub"
  | "gomod"
  | "nuget"
  | "vcpkg"
  | "conan"
  | "maven"
  | "gradle"
  | "pip"
  | "poetry"
  | "conda"
  | "gem"
  | "bundler";

export type Framework =
  | "react"
  | "vue"
  | "angular"
  | "nextjs"
  | "nuxtjs"
  | "svelte"
  | "remix"
  | "astro"
  | "express"
  | "nestjs"
  | "fastify"
  | "gin"
  | "echo"
  | "fiber"
  | "chi"
  | "gorilla-mux"
  | "spring-boot"
  | "quarkus"
  | "micronaut"
  | "jakarta-ee"
  | "django"
  | "fastapi"
  | "flask"
  | "tornado"
  | "rails"
  | "sinatra"
  | "hanami"
  | "aspnet-core"
  | "blazor"
  | "maui"
  | "wpf"
  | "qt"
  | "boost"
  | "poco"
  | "wxwidgets";

export type Priority = "critical" | "high" | "medium" | "low" | "info";

// ─── Healing / Analyzer finding types ────────────────────────────────────────

export interface CVE {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  cvssScore: number;
  description: string;
  patchedVersion: string;
}

export interface DependencyFinding {
  ecosystem: Ecosystem;
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  updateType: "major" | "minor" | "patch";
  vulnerabilities: CVE[];
  breakingChanges: boolean;
  framework?: Framework;
  manifestFile?: string;
}

/** runner の正規表現ベース静的解析が出力する finding（旧称 CodeQLFinding）。 */
export interface StaticAnalysisFinding {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  severity: Priority;
  file: string;
  line?: number;
  cwe?: string[];
  language?: Language;
}

export interface PerformanceFinding {
  subsystem: string;
  metric: string;
  baseline: number;
  current: number;
  deltaPct: number;
  thresholdPct: number;
}

export interface SecretFinding {
  type: "secret";
  tool: "trufflehog" | "gitleaks";
  detector: string;
  file: string;
  line: number;
  commit?: string;
  description: string;
}

export interface LicenseFinding {
  type: "license";
  file: string;
  packageName: string;
  license: string;
  status: "forbidden" | "unknown" | "allowed";
  description: string;
}

export interface FixStrategy {
  title: string;
  steps: string[];
  rationale: string;
}

export interface FindingGroup {
  id: string;
  priority: Priority;
  findings: Array<StaticAnalysisFinding | DependencyFinding | PerformanceFinding | SecretFinding>;
  autoFixable: boolean;
  estimatedRisk: string;
  fixStrategy: FixStrategy;
  language?: Language;
  framework?: Framework;
}

export interface Patch {
  file: string;
  originalContent: string;
  fixedContent: string;
  diff: string;
  explanation: string;
}

export interface ValidationResult {
  success: boolean;
  output: string;
}

export interface FixResult {
  success: boolean;
  appliedPatches: Patch[];
  failedFindings: FindingGroup[];
  validationOutput: string;
  iterations: number;
}

export interface AllFindings {
  staticAnalysis: StaticAnalysisFinding[];
  dependency: DependencyFinding[];
  performance: PerformanceFinding[];
  secrets: SecretFinding[];
  licenses: LicenseFinding[];
  detectedFrameworks: Framework[];
  timestamp: Date;
  commitHash: string;
}

export interface AnalysisResult {
  groups: FindingGroup[];
  summary: string;
  riskScore: number;
  estimatedFixTime: number;
}

export interface CreatedPR {
  number: number;
  url: string;
  branch: string;
  title: string;
}

// ─── Inspection scoring primitives ───────────────────────────────────────────

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

/**
 * The 32 fine-grained aspects, each rolling up into exactly one parent
 * InspectionCategory. See inspection/aspects.ts for the category mapping,
 * labels and descriptions.
 */
export type InspectionAspect =
  // security (6)
  | "injection"
  | "authn_authz"
  | "secrets"
  | "input_validation"
  | "deps_supply_chain"
  | "crypto_transport"
  // performance (5)
  | "algo_complexity"
  | "memory_alloc"
  | "async_concurrency"
  | "io_network"
  | "caching"
  // redundancy (5)
  | "duplication"
  | "dead_code"
  | "over_engineering"
  | "redundant_compute"
  | "dep_bloat"
  // readability (5)
  | "naming"
  | "cognitive_complexity"
  | "comments_docs"
  | "formatting_consistency"
  | "idiomatic_usage"
  // design (6)
  | "srp_cohesion"
  | "coupling"
  | "abstraction_interface"
  | "error_handling"
  | "modularity_extensibility"
  | "pattern_fit"
  // correctness (5)
  | "logic_intent"
  | "edge_cases"
  | "null_boundary"
  | "concurrency_correctness"
  | "type_contract";

export interface ScoreDimension {
  /** 0–100 */
  score: Score;
  /** Fraction of the overall score this dimension contributes (0–1, all dims sum to 1) */
  weight: number;
  /** One-sentence assessment of this dimension */
  summary: string;
}

export type ScoreBreakdown = Record<InspectionCategory, ScoreDimension>;

/** A single aspect's score, its weight, and its parent category. */
export interface AspectDimension extends ScoreDimension {
  category: InspectionCategory;
}

export type AspectBreakdown = Record<InspectionAspect, AspectDimension>;

export interface ScoreCard {
  /** Weighted sum of all aspect scores, 0–100 */
  overall: Score;
  grade: Grade;
  /** Parent-category rollup (6 dimensions) — derived from aspectBreakdown */
  breakdown: ScoreBreakdown;
  /** Fine-grained per-aspect breakdown (32 dimensions) */
  aspectBreakdown: AspectBreakdown;
}

// ─── Inspection findings ──────────────────────────────────────────────────────

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

// ─── Top-level inspection result ─────────────────────────────────────────────

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

// ─── Webhook payload types ────────────────────────────────────────────────────

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

// ─── Webhook endpoint configuration ──────────────────────────────────────────

export type WebhookAdapter = "slack" | "discord" | "github" | "generic";

export interface ScoreThresholdConfig {
  overall?: Score;
  security?: Score;
  performance?: Score;
  redundancy?: Score;
  readability?: Score;
  design?: Score;
  correctness?: Score;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  adapter: WebhookAdapter;
  /** Which events trigger this endpoint */
  events: WebhookEvent[];
  /** When set, request body is HMAC-SHA256 signed; signature added as X-Ouroboros-Signature */
  secret?: string;
  /** Extra HTTP headers merged into every request */
  headers?: Record<string, string>;
  enabled: boolean;
  /** Per-endpoint score thresholds; overrides global thresholds for this endpoint */
  scoreThresholds?: ScoreThresholdConfig;
}

export interface WebhookDeliveryResult {
  endpointId: string;
  endpointName: string;
  event: WebhookEvent;
  success: boolean;
  statusCode?: number;
  error?: string;
  attemptCount: number;
  deliveredAt: string;
}

// ─── Code Session types ─────────────────────────────────────────────────────────

export type CodeSessionStatus =
  | "initializing"
  | "ready"
  | "generating"
  | "generated"
  | "applying"
  | "applied"
  | "failed"
  | "dismissed";

export interface CodeSessionRow {
  id: string;
  user_id: string;
  repo_url: string;
  branch: string;
  base_branch: string;
  title: string;
  instruction: string;
  status: CodeSessionStatus;
  /** Plan フェーズで生成された実装計画（0008_mode_models で追加） */
  plan?: string | null;
  generated_patches: string | null;
  applied_branch: string | null;
  pr_number: number | null;
  pr_url: string | null;
  created_at: number;
  updated_at: number;
}
