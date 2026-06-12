import { InspectionCategory } from "../types/inspection.types";

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
    weights: Record<InspectionCategory, number>;
    gradeThresholds: { S: number; A: number; B: number; C: number; D: number };
  };
  refactor: {
    /** Units with an overall score below this are refactoring candidates */
    overallThreshold: number;
    /** Units with any dimension score below this are refactoring candidates */
    dimensionThreshold: number;
  };
}

export const DEFAULT_WEIGHTS: Record<InspectionCategory, number> = {
  security: 0.25,
  performance: 0.20,
  redundancy: 0.15,
  readability: 0.15,
  design: 0.15,
  correctness: 0.10,
};

export const DEFAULT_GRADE_THRESHOLDS = {
  S: 95,
  A: 85,
  B: 70,
  C: 55,
  D: 40,
};

export const defaultInspectionConfig: InspectionConfig = {
  ai: {
    model: "minimax/m3",
    maxTokens: 8192,
    maxRetries: 2,
  },
  preprocessing: {
    maxFileSizeBytes: 50_000,
    maxFiles: 20,
  },
  scoring: {
    weights: DEFAULT_WEIGHTS,
    gradeThresholds: DEFAULT_GRADE_THRESHOLDS,
  },
  refactor: {
    overallThreshold: 70,
    dimensionThreshold: 60,
  },
};
