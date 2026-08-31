/** 進行中（修復待ちの analyzed は含まない）。 */
export const HEALING_ACTIVE_STATUSES = [
  "queued",
  "indexing",
  "scanning",
  "analyzing",
  "fixing",
  "running",
] as const;

export type HealingActiveStatus = (typeof HEALING_ACTIVE_STATUSES)[number];

export const HEALING_ACTIVE_SQL = HEALING_ACTIVE_STATUSES.map((s) => `'${s}'`).join(", ");

export const HEALING_STATUS_LABELS: Record<string, { label: string; class: string }> = {
  queued: { label: "待機中", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  indexing: { label: "インデックス中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  scanning: { label: "スキャン中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  analyzing: { label: "解析中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  analyzed: { label: "解析完了", class: "bg-violet-500/10 text-violet-400 border border-violet-500/20" },
  fixing: { label: "修復中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  running: { label: "実行中", class: "bg-sky-500/10 text-sky-400 border border-sky-500/20" },
  done: { label: "修復完了", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  failed: { label: "失敗", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  canceled: { label: "キャンセル", class: "bg-base-300/50 text-base-content/60 border border-base-300" },
};

export const HEALING_TRIGGER_LABELS: Record<string, string> = {
  api: "API",
  gui: "GUI",
  cron: "スケジュール",
};

export const HEALING_INSPECTION_TARGET_PREFIX = "healing:";

export function isHealingActive(status: string): boolean {
  return (HEALING_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function healingInspectionTarget(runId: string): string {
  return `${HEALING_INSPECTION_TARGET_PREFIX}${runId}`;
}
