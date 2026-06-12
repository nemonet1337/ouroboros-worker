import { existsSync, readFileSync } from "node:fs";
import { PerformanceFinding } from "../types";
import { HealingConfig } from "../config/healing.config";

interface LighthouseAudit {
  numericValue?: number;
  score?: number;
}

interface LighthouseReport {
  audits?: Record<string, LighthouseAudit>;
}

interface BenchEntry {
  metric: string;
  subsystem: string;
  baseline: number;
  current: number;
}

export class PerformanceScanner {
  constructor(private readonly _config: HealingConfig) {}

  async scan(_targetDir: string): Promise<PerformanceFinding[]> {
    const thresholdPct = Number(process.env.PERF_THRESHOLD_PCT ?? "20");
    const findings: PerformanceFinding[] = [];

    findings.push(...this.parseLighthouse(thresholdPct));
    findings.push(...this.parseBenchmark(thresholdPct));

    return findings;
  }

  private parseLighthouse(thresholdPct: number): PerformanceFinding[] {
    const reportPath = process.env.LIGHTHOUSE_REPORT_PATH ?? "./results/lighthouse.json";
    if (!existsSync(reportPath)) return [];

    const THRESHOLDS: Record<string, number> = {
      "first-contentful-paint": 1800,
      "largest-contentful-paint": 2500,
      "total-blocking-time": 200,
      "cumulative-layout-shift": 0.1,
      "speed-index": 3400,
      interactive: 3800,
    };

    try {
      const report = JSON.parse(readFileSync(reportPath, "utf-8")) as LighthouseReport;
      const findings: PerformanceFinding[] = [];

      for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
        const audit = report.audits?.[metric];
        if (!audit?.numericValue) continue;
        const current = audit.numericValue;
        const deltaPct = ((current - threshold) / threshold) * 100;

        if (deltaPct > thresholdPct) {
          findings.push({
            subsystem: "lighthouse",
            metric,
            baseline: threshold,
            current,
            deltaPct,
            thresholdPct,
          });
        }
      }
      return findings;
    } catch {
      return [];
    }
  }

  private parseBenchmark(thresholdPct: number): PerformanceFinding[] {
    const reportPath = process.env.BENCH_REPORT_PATH ?? "./results/benchmark.json";
    if (!existsSync(reportPath)) return [];

    try {
      const entries = JSON.parse(readFileSync(reportPath, "utf-8")) as BenchEntry[];
      return entries
        .map((entry) => {
          const deltaPct =
            entry.baseline !== 0
              ? ((entry.current - entry.baseline) / Math.abs(entry.baseline)) * 100
              : 0;
          return { ...entry, deltaPct, thresholdPct };
        })
        .filter((f) => Math.abs(f.deltaPct) > thresholdPct);
    } catch {
      return [];
    }
  }
}
