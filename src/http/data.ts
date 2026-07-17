/**
 * Data-shaping helpers shared by the JSON API (src/http/api.ts) and the
 * SSR HTML fragment routes (src/ui/fragments.tsx). Extracted verbatim from
 * api.ts so both layers serve identical data from a single implementation.
 */
import type {
  InspectionRepository,
  HealingRunRepository,
  SettingsRepository,
  HealingRunRow,
  WebhookRow,
} from "../db/repositories";
import type { Ports } from "../ports";
import type { AuthService } from "../auth/service";
import type { Logger } from "../logging/logger";
import type { InspectionRequest, InspectionResult } from "../types";
import { defaultInspectionConfig } from "../config/inspection.config";
import { InspectionEngine } from "../inspection/inspection.engine";
import { WeightAdvisor } from "../inspection/weight.advisor";
import { newId } from "../auth/tokens";

export interface HistoryEntry {
  id: string;
  date: string;
  overall: number;
  security: number;
  performance: number;
}

export function parseHistoryEntry(row: { id: string; result: string; created_at: number }): HistoryEntry {
  let overall = 0;
  let security = 0;
  let performance = 0;
  try {
    const r = JSON.parse(row.result) as {
      scoreCard?: { overall?: number; breakdown?: Record<string, { score?: number }> };
    };
    overall = Math.round(r.scoreCard?.overall ?? 0);
    security = Math.round(r.scoreCard?.breakdown?.security?.score ?? 0);
    performance = Math.round(r.scoreCard?.breakdown?.performance?.score ?? 0);
  } catch {
    // leave zeros
  }
  return {
    id: row.id,
    date: new Date(row.created_at).toISOString().slice(0, 10),
    overall,
    security,
    performance,
  };
}

export interface MetricsPrEntry {
  number: number;
  title: string;
  status: "merged" | "open";
  date: string;
  branch: string;
  cause: "security" | "performance" | "dependency";
}

export interface MetricsDependencyChange {
  name: string;
  before: string;
  after: string;
  type: "major" | "minor" | "patch";
  severity: "high" | "medium" | "low";
}

export interface MetricsData {
  inspectionCount: number;
  latestOverall: number;
  avgOverall: number;
  riskScore: number;
  healingRuns: number;
  lastRun: HealingRunRow | null;
  history: HistoryEntry[];
  prHistory: MetricsPrEntry[];
  dependencyChanges: MetricsDependencyChange[];
  causeData: { security: number; performance: number };
  codeStats: {
    additions: number;
    deletions: number;
    filesChanged: number;
    commits: number;
    linesScanned: number;
  };
}

export async function buildMetricsData(
  inspections: InspectionRepository,
  runs: HealingRunRepository,
  userId: string
): Promise<MetricsData> {
  const recentInspections = await inspections.listByUser(userId, 100);
  const recentRuns = await runs.recent(100);
  const history = recentInspections.map((r) => parseHistoryEntry(r)).reverse();

  const inspectionCount = history.length;
  const latestOverall = history[history.length - 1]?.overall ?? 0;
  const avgOverall =
    inspectionCount > 0 ? Math.round(history.reduce((s, h) => s + h.overall, 0) / inspectionCount) : 0;
  const riskScore = Math.max(0, 100 - latestOverall);

  // Dynamic PR history parsing from healing runs
  const prHistory: MetricsPrEntry[] = [];
  const dependencyChanges: MetricsDependencyChange[] = [];
  for (const run of recentRuns) {
    if (!run.summary) continue;
    try {
      const sum = JSON.parse(run.summary);
      if (sum.prs && Array.isArray(sum.prs)) {
        for (const pr of sum.prs) {
          const cause = pr.title.toLowerCase().includes("perf")
            ? "performance"
            : pr.title.toLowerCase().includes("deps")
              ? "dependency"
              : "security";
          prHistory.push({
            number: pr.number,
            title: pr.title,
            status: run.status === "done" ? "merged" : "open",
            date: new Date(run.created_at).toISOString().slice(0, 10),
            branch: pr.branch,
            cause,
          });

          const match = pr.title.match(/update\s+([@a-zA-Z0-9\/-]+)\s+([0-9\.]+)\s*(?:->|→)\s*([0-9\.]+)/i);
          if (match) {
            const [_, name, before, after] = match;
            const beforeParts = before.split(".");
            const afterParts = after.split(".");
            let type: "major" | "minor" | "patch" = "patch";
            if (beforeParts[0] !== afterParts[0]) type = "major";
            else if (beforeParts[1] !== afterParts[1]) type = "minor";

            dependencyChanges.push({
              name,
              before,
              after,
              type,
              severity: type === "major" ? "high" : type === "minor" ? "medium" : "low",
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  let securityCount = 0;
  let performanceCount = 0;
  let dependencyCount = 0;
  for (const pr of prHistory) {
    if (pr.cause === "security") securityCount++;
    else if (pr.cause === "performance") performanceCount++;
    else if (pr.cause === "dependency") dependencyCount++;
  }
  const totalCause = securityCount + performanceCount + dependencyCount;
  const causeData =
    totalCause > 0
      ? {
          security: Math.round((securityCount / totalCause) * 100),
          performance: Math.round((performanceCount / totalCause) * 100),
        }
      : { security: 0, performance: 0 };

  let linesScanned = 0;
  for (const row of recentInspections) {
    try {
      const res = JSON.parse(row.result);
      if (res.files && Array.isArray(res.files)) {
        linesScanned += res.files.length * 120; // estimate avg 120 lines
      }
    } catch {}
  }
  const codeStats = {
    additions: prHistory.length * 35,
    deletions: prHistory.length * 12,
    filesChanged: prHistory.length * 2,
    commits: prHistory.length,
    linesScanned,
  };

  return {
    inspectionCount,
    latestOverall,
    avgOverall,
    riskScore,
    healingRuns: recentRuns.length,
    lastRun: recentRuns[0] ?? null,
    history,
    prHistory,
    dependencyChanges,
    causeData,
    codeStats,
  };
}

export interface WebhookView {
  id: string;
  url: string;
  enabled: boolean;
  name: string;
  adapter: string;
  events: string[];
  scoreThresholds: Record<string, number>;
  secret: string;
}

export function shapeWebhookRow(r: WebhookRow): WebhookView {
  let cfg: any = {};
  try {
    cfg = r.config ? JSON.parse(r.config) : {};
  } catch {}
  return {
    id: r.id,
    url: r.url,
    enabled: r.enabled === 1,
    name: cfg.name || "webhook",
    adapter: r.type || cfg.adapter || "generic",
    events: cfg.events || ["inspection.completed"],
    scoreThresholds: cfg.scoreThresholds || { overall: 70 },
    secret: cfg.secret || "",
  };
}

/** Legacy external-gateway config keys — purged on every read/write. The only
 * AI credential is the WORKERS_AI_API_TOKEN secret, managed outside the GUI. */
export const LEGACY_GATEWAY_CONFIG_KEYS = ["anthropicToken", "openaiToken", "geminiToken", "openrouterToken"];

export const CONFIG_KEY = "app_config";

export interface PublicConfig extends Record<string, unknown> {
  gitRepository: string;
  gitTokenSet: boolean;
}

export const DAILY_INSPECTION_LIMIT = 100;

export type InspectionRunOutcome =
  | { ok: true; result: InspectionResult }
  | { ok: false; status: 429 | 502; code: "rate_limited" | "quota_exceeded" | "inspection_failed"; message: string };

/**
 * Per-user rate-limit + daily-quota guarded inspection run, persisted to the
 * inspections table. Shared by POST /api/v1/inspect and the GUI inspect
 * fragment so both enforce identical limits and store identical rows.
 */
export async function runUserInspection(opts: {
  ports: Pick<Ports, "ai" | "rateLimiter" | "vectorize">;
  inspections: InspectionRepository;
  auth: AuthService;
  log: Logger;
  userId: string;
  req: InspectionRequest;
}): Promise<InspectionRunOutcome> {
  const { ports, inspections, auth, log, userId, req } = opts;

  // Per-user rate limit on the inspect endpoint.
  const { success: rlOk } = await ports.rateLimiter.limit(`inspect:${userId}`);
  if (!rlOk) {
    return { ok: false, status: 429, code: "rate_limited", message: "rate limit exceeded" };
  }

  // Daily inspection quota per user.
  const todayStart = Date.now() - (Date.now() % 86_400_000);
  const todayCount = await inspections.countSince(userId, todayStart);
  if (todayCount >= DAILY_INSPECTION_LIMIT) {
    return {
      ok: false,
      status: 429,
      code: "quota_exceeded",
      message: `daily inspection limit of ${DAILY_INSPECTION_LIMIT} reached`,
    };
  }

  req.id ||= newId();
  req.requestedAt ||= new Date().toISOString();

  const model = await auth.resolveModel(userId, "inspection");

  const advisor = ports.vectorize ? new WeightAdvisor(ports.vectorize) : undefined;
  const engine = new InspectionEngine(ports.ai, { ai: { ...defaultInspectionConfig.ai, model } }, advisor);
  try {
    const result = await engine.inspect(req);
    await inspections.insert({
      id: result.id,
      user_id: userId,
      target: req.language ?? null,
      result: JSON.stringify(result),
      status: "completed",
      progress: null,
      created_at: Date.now(),
    });
    await log.info("inspection complete", { id: result.id, grade: result.scoreCard.grade });
    return { ok: true, result };
  } catch (err) {
    await log.error("inspection failed", { reason: (err as Error).message });
    return { ok: false, status: 502, code: "inspection_failed", message: (err as Error).message };
  }
}

export async function loadPublicConfig(
  settingsRepo: SettingsRepository,
  vcs: { owner: string; repo: string },
  githubTokenSet: boolean
): Promise<PublicConfig> {
  const raw = await settingsRepo.get(CONFIG_KEY);
  const cfg = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  // Git credentials are managed via CF Secrets — never expose stored copies.
  for (const k of ["gitToken", "gitPackage", "gitService", ...LEGACY_GATEWAY_CONFIG_KEYS]) delete cfg[k];
  const { owner, repo } = vcs;
  return {
    ...cfg,
    gitRepository: owner && repo ? `${owner}/${repo}` : "",
    gitTokenSet: githubTokenSet,
  };
}
