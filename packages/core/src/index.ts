// Ouroboros core API — built for (and only for) Cloudflare Workers.

export * from "./types";
export * from "./ports";
export * as db from "./db/index";
export { runMigrations, MIGRATIONS } from "./db/index";
export {
  UserRepository,
  SessionRepository,
  ApiTokenRepository,
  SettingsRepository,
  InspectionRepository,
  WebhookRepository,
  HealingRunRepository,
} from "./db/repositories";
export * as auth from "./auth/index";
export { AuthService, AuthError } from "./auth/service";
export type { AuthedUser, TokenIdentity } from "./auth/service";

export { Logger } from "./logging/logger";
export type { LogLevel } from "./logging/logger";

export { GitHubProvider } from "./vcs/github.provider";
export type { GitHubConfig } from "./vcs/github.provider";

export { AIAnalyzer } from "./analyzers/ai.analyzer";
export { Notifier } from "./notifications/notifier";
export { AlertService } from "./notifications/alerts";
export { PRDeduplicator } from "./pr/pr.deduplicator";
export { PRMerger } from "./pr/pr.merger";
export { PRReviewer } from "./pr/pr.reviewer";
export { FixCache } from "./utils/fix.cache";
export { Escalator } from "./utils/escalator";
export { buildPRBody, buildPRTitle } from "./pr/pr.body";

export { runHealingCycle } from "./healing/orchestrator";
export type { HealingCycleOptions, HealingCycleResult } from "./healing/orchestrator";

export { defaultHealingConfig } from "./config/healing.config";
export type { HealingConfig } from "./config/healing.config";
export {
  defaultInspectionConfig,
  DEFAULT_WEIGHTS,
  DEFAULT_ASPECT_WEIGHTS,
  deriveCategoryWeights,
} from "./config/inspection.config";
export type { InspectionConfig } from "./config/inspection.config";
export { DEFAULT_WORKERS_AI_MODEL, isWorkersAiModelId } from "./config/deployment";
export type { DeployTarget } from "./config/deployment";

// Inspection engine (heuristic scoring) — runtime-agnostic
export { InspectionEngine } from "./inspection/inspection.engine";
export { WeightAdvisor } from "./inspection/weight.advisor";
export { selectRefactorCandidates } from "./inspection/refactor.selector";
export type { RefactorSelectorConfig } from "./inspection/refactor.selector";
export {
  ASPECTS,
  ASPECTS_BY_CATEGORY,
  ASPECT_CATEGORY,
  ASPECT_LABELS,
  ASPECT_DESCRIPTIONS,
} from "./inspection/aspects";
export type {
  InspectionRequest,
  InspectionResult,
  InspectionCategory,
  InspectionAspect,
  InspectionFinding,
  InspectionOptions,
  FileResult,
  FunctionResult,
  Recommendation,
  RefactorCandidate,
  RefactorPriority,
  ScoreCard,
  ScoreBreakdown,
  ScoreDimension,
  AspectBreakdown,
  AspectDimension,
  ScoreThresholds,
  Grade,
} from "./types/inspection.types";

// Webhook subsystem — runtime-agnostic (fetch-based)
export { WebhookManager } from "./webhook/webhook.manager";

// Shared HTTP API (Hono) — mounted by both the Node server and the Worker
export { createApi, mountApi } from "./http/api";
export type { ApiDeps, TriggerHealingResult } from "./http/api";
export { OPENAPI_SPEC } from "./http/openapi";
