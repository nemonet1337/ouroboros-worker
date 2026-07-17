import type { FlagshipBinding } from "../env";
import type { SettingsRepository } from "../db/repositories";
import { getFeatureFlags } from "../config/settings.keys";

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

/**
 * 機能トグルの解決順:
 *   1. settings.feature_flags JSON に該当キーがあればそれを採用（DB 永続・GUI 管理）
 *   2. Flagship（env.FLAGS）→ デフォルト値
 */
export async function resolveFeatureFlag(
  settings: SettingsRepository,
  flags: FlagService | undefined,
  flagName: string,
  defaultValue: boolean
): Promise<boolean> {
  const stored = await getFeatureFlags(settings).catch(() => ({}) as Record<string, boolean>);
  if (Object.prototype.hasOwnProperty.call(stored, flagName)) {
    return stored[flagName];
  }
  if (flags) {
    return flags.get(flagName, defaultValue);
  }
  return defaultValue;
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