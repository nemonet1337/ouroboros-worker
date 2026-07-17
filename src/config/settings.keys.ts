/**
 * `settings` KV テーブルに保存するシステム全体設定のキーとヘルパー。
 *
 * - selected_repo   : システム全体で 1 つの選択リポジトリ（"owner/name"）
 * - feature_flags   : 機能トグルの JSON（{ "code-needs-fix": true, ... }）
 * - webhooks_enabled: Webhook 配信のグローバルスイッチ（"true" / "false"）
 */
import type { SettingsRepository } from "../db/repositories";

export const SELECTED_REPO_KEY = "selected_repo";
export const FEATURE_FLAGS_KEY = "feature_flags";
export const WEBHOOKS_ENABLED_KEY = "webhooks_enabled";

export interface SelectedRepo {
  owner: string;
  repo: string;
}

/** "owner/name" 形式の選択リポジトリを読む。未設定・不正な場合は null。 */
export async function getSelectedRepo(settings: SettingsRepository): Promise<SelectedRepo | null> {
  const raw = await settings.get(SELECTED_REPO_KEY);
  return parseSelectedRepo(raw);
}

export function parseSelectedRepo(raw: string | undefined | null): SelectedRepo | null {
  if (!raw) return null;
  const parts = raw.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts.map((s) => s.trim());
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** "owner/name" を検証して保存する。 */
export async function setSelectedRepo(settings: SettingsRepository, ownerRepo: string): Promise<SelectedRepo> {
  const parsed = parseSelectedRepo(ownerRepo);
  if (!parsed) throw new Error("リポジトリは owner/name 形式で指定してください");
  await settings.set(SELECTED_REPO_KEY, `${parsed.owner}/${parsed.repo}`);
  return parsed;
}

/** 機能トグルの JSON を読む。不正な場合は空オブジェクト。 */
export async function getFeatureFlags(settings: SettingsRepository): Promise<Record<string, boolean>> {
  const raw = await settings.get(FEATURE_FLAGS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "boolean")
      ) as Record<string, boolean>;
    }
  } catch {
    // 不正な JSON は未設定として扱う
  }
  return {};
}

export async function setFeatureFlags(
  settings: SettingsRepository,
  flags: Record<string, boolean>
): Promise<void> {
  await settings.set(FEATURE_FLAGS_KEY, JSON.stringify(flags));
}

/** Webhook 配信のグローバルスイッチ。未設定はデフォルト有効。 */
export async function areWebhooksEnabled(settings: SettingsRepository): Promise<boolean> {
  const raw = await settings.get(WEBHOOKS_ENABLED_KEY);
  return raw !== "false";
}

export async function setWebhooksEnabled(settings: SettingsRepository, enabled: boolean): Promise<void> {
  await settings.set(WEBHOOKS_ENABLED_KEY, enabled ? "true" : "false");
}
