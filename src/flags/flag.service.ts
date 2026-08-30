import type { SettingsRepository } from "../db/repositories";
import { getFeatureFlags } from "../config/settings.keys";

/**
 * 機能トグルは settings.feature_flags JSON（DB 永続・GUI 管理）のみ。
 * キーが無ければ defaultValue。
 */
export async function resolveFeatureFlag(
  settings: SettingsRepository,
  flagName: string,
  defaultValue: boolean
): Promise<boolean> {
  const stored = await getFeatureFlags(settings).catch(() => ({}) as Record<string, boolean>);
  if (Object.prototype.hasOwnProperty.call(stored, flagName)) {
    return stored[flagName];
  }
  return defaultValue;
}

export const FLAGS = {
  CODE_NEEDS_FIX: "code-needs-fix",
  CODE_FIX_COMPLETE: "code-fix-complete",
  REFACTOR_APPROVED: "refactor-approved",
  REFACTOR_APPLIED: "refactor-applied",
} as const;
