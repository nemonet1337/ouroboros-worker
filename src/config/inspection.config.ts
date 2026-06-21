import { InspectionAspect, InspectionCategory } from "../types";
import { ASPECTS_BY_CATEGORY } from "../inspection/aspects";
import { DEFAULT_WORKERS_AI_MODEL } from "./deployment";

export interface InspectionConfig {
  ai: {
    model: string;
    maxTokens: number;
    maxRetries: number;
  };
  preprocessing: {
    /** Files larger than this (bytes) are line-truncated before being sent to the AI */
    maxFileSizeBytes: number;
    /** Hard cap on the number of files in a single request */
    maxFiles: number;
  };
  scoring: {
    /** Per-aspect weights (32 entries, all summing to 1). Parent-category weight = sum of its children. */
    weights: Record<InspectionAspect, number>;
    gradeThresholds: { S: number; A: number; B: number; C: number; D: number };
  };
  refactor: {
    /** Units with an overall score below this are refactoring candidates */
    overallThreshold: number;
    /** Units with any dimension score below this are refactoring candidates */
    dimensionThreshold: number;
  };
}

/**
 * Default parent-category weights (sum to 1). Retained for the GUI and for
 * deriving the per-aspect defaults below.
 */
export const DEFAULT_WEIGHTS: Record<InspectionCategory, number> = {
  security: 0.25,
  performance: 0.20,
  redundancy: 0.15,
  readability: 0.15,
  design: 0.15,
  correctness: 0.10,
};

/**
 * Default per-aspect weights (32 entries, sum to 1). Each category's budget
 * (DEFAULT_WEIGHTS) is distributed across its child aspects, front-loading the
 * higher-impact aspects within each category.
 */
export const DEFAULT_ASPECT_WEIGHTS: Record<InspectionAspect, number> = {
  // security — 0.25
  injection: 0.06,
  authn_authz: 0.055,
  secrets: 0.045,
  input_validation: 0.045,
  deps_supply_chain: 0.025,
  crypto_transport: 0.02,
  // performance — 0.20
  algo_complexity: 0.06,
  memory_alloc: 0.04,
  async_concurrency: 0.045,
  io_network: 0.035,
  caching: 0.02,
  // redundancy — 0.15
  duplication: 0.045,
  dead_code: 0.03,
  over_engineering: 0.035,
  redundant_compute: 0.02,
  dep_bloat: 0.02,
  // readability — 0.15
  naming: 0.035,
  cognitive_complexity: 0.04,
  comments_docs: 0.025,
  formatting_consistency: 0.02,
  idiomatic_usage: 0.03,
  // design — 0.15
  srp_cohesion: 0.03,
  coupling: 0.03,
  abstraction_interface: 0.025,
  error_handling: 0.03,
  modularity_extensibility: 0.02,
  pattern_fit: 0.015,
  // correctness — 0.10
  logic_intent: 0.035,
  edge_cases: 0.025,
  null_boundary: 0.02,
  concurrency_correctness: 0.01,
  type_contract: 0.01,
};

export const DEFAULT_GRADE_THRESHOLDS = {
  S: 95,
  A: 85,
  B: 70,
  C: 55,
  D: 40,
};

/** Derive parent-category weights (sum of child aspect weights) from aspect weights. */
export function deriveCategoryWeights(
  aspectWeights: Record<InspectionAspect, number>
): Record<InspectionCategory, number> {
  const out = {} as Record<InspectionCategory, number>;
  for (const [cat, aspects] of Object.entries(ASPECTS_BY_CATEGORY) as [
    InspectionCategory,
    InspectionAspect[]
  ][]) {
    out[cat] = aspects.reduce((sum, a) => sum + (aspectWeights[a] ?? 0), 0);
  }
  return out;
}

export const defaultInspectionConfig: InspectionConfig = {
  ai: {
    model: DEFAULT_WORKERS_AI_MODEL,
    maxTokens: 8192,
    maxRetries: 2,
  },
  preprocessing: {
    maxFileSizeBytes: 50_000,
    maxFiles: 20,
  },
  scoring: {
    weights: DEFAULT_ASPECT_WEIGHTS,
    gradeThresholds: DEFAULT_GRADE_THRESHOLDS,
  },
  refactor: {
    overallThreshold: 70,
    dimensionThreshold: 60,
  },
};
