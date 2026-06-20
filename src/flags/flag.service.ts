import type { FlagshipBinding } from "../env";

export class FlagService {
  constructor(private readonly flags?: FlagshipBinding) {}

  async get(flag: string, defaultValue: boolean): Promise<boolean> {
    if (!this.flags) return defaultValue;
    return this.flags.getBooleanValue(flag, defaultValue);
  }

  async getString(flag: string, defaultValue: string): Promise<string> {
    if (!this.flags) return defaultValue;
    return this.flags.getStringValue(flag, defaultValue);
  }

  async getNumber(flag: string, defaultValue: number): Promise<number> {
    if (!this.flags) return defaultValue;
    return this.flags.getNumberValue(flag, defaultValue);
  }
}

export const FLAGS = {
  CODE_NEEDS_FIX: "code-needs-fix",
  CODE_FIX_COMPLETE: "code-fix-complete",
  CODE_PR_READY: "code-pr-ready",
  CODE_REVIEW_REQUIRED: "code-review-required",
  REFACTOR_APPROVED: "refactor-approved",
  REFACTOR_APPLIED: "refactor-applied",
  BROWSER_TEST_ENABLED: "browser-test-enabled",
  ANALYTICS_ENABLED: "analytics-enabled",
} as const;