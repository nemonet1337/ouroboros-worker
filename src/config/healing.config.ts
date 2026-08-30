import { DEFAULT_WORKERS_AI_MODEL } from "./deployment";

export interface HealingConfig {
  ai: { model: string; maxRetries: number; contextLines: number };
  vcs: { owner: string; repo: string; baseBranch: string; branchPrefix: string };
  dryRun: boolean;
  scan: { maxPRsPerRun: number };
}

export const defaultHealingConfig: HealingConfig = {
  ai: {
    model: DEFAULT_WORKERS_AI_MODEL,
    maxRetries: 3,
    contextLines: 20,
  },
  vcs: {
    owner: "",
    repo: "",
    baseBranch: "main",
    branchPrefix: "heal/",
  },
  dryRun: false,
  scan: {
    maxPRsPerRun: 5,
  },
};
