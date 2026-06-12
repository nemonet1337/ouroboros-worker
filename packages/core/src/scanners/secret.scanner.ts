import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { SecretFinding } from "../types";
import { HealingConfig } from "../config/healing.config";

export class SecretScanner {
  constructor(private readonly config: HealingConfig) {}

  async scan(): Promise<SecretFinding[]> {
    if (!this.config.scan.secretScanEnabled) return [];

    const [truffleFindings, gitleaksFindings] = await Promise.allSettled([
      this.runTrufflehog(),
      this.runGitleaks(),
    ]);

    const all: SecretFinding[] = [
      ...(truffleFindings.status === "fulfilled" ? truffleFindings.value : []),
      ...(gitleaksFindings.status === "fulfilled" ? gitleaksFindings.value : []),
    ];

    return this.dedup(all);
  }

  private async runTrufflehog(): Promise<SecretFinding[]> {
    try {
      const raw = execSync(
        "trufflehog filesystem . --json --no-update --only-verified",
        { stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }
      ).toString();

      const findings: SecretFinding[] = [];
      for (const rawLine of raw.split("\n")) {
        if (!rawLine.trim().startsWith("{")) continue;
        try {
          const obj = JSON.parse(rawLine) as {
            DetectorName?: string;
            SourceMetadata?: { Data?: { Filesystem?: { file?: string; line?: number } } };
          };
          const file = obj.SourceMetadata?.Data?.Filesystem?.file ?? "unknown";
          const lineNum = obj.SourceMetadata?.Data?.Filesystem?.line ?? 0;
          findings.push({
            type: "secret",
            tool: "trufflehog",
            detector: obj.DetectorName ?? "unknown",
            file,
            line: lineNum,
            description: `Secret detected by trufflehog (${obj.DetectorName ?? "unknown"}) in ${file}:${lineNum}`,
          });
        } catch {
          // skip malformed lines
        }
      }
      return findings;
    } catch (err) {
      console.warn("[SecretScanner] trufflehog scan failed (tool may not be installed):", err instanceof Error ? err.message : err);
      return [];
    }
  }

  private async runGitleaks(): Promise<SecretFinding[]> {
    const outPath = "/tmp/gitleaks-result.json";
    try {
      execSync(
        `gitleaks detect --report-format json --report-path ${outPath} --no-banner --exit-code 0`,
        { stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }
      );

      if (!existsSync(outPath)) return [];

      const raw = readFileSync(outPath, "utf-8");
      // Delete immediately to avoid secret values lingering
      try { unlinkSync(outPath); } catch { /**/ }

      const results = JSON.parse(raw) as Array<{
        RuleID?: string;
        File?: string;
        StartLine?: number;
        Commit?: string;
      }>;

      return results.map((r) => ({
        type: "secret",
        tool: "gitleaks",
        detector: r.RuleID ?? "unknown",
        file: r.File ?? "unknown",
        line: r.StartLine ?? 0,
        commit: r.Commit,
        description: `Secret detected by gitleaks (${r.RuleID ?? "unknown"}) in ${r.File ?? "unknown"}:${r.StartLine ?? 0}`,
      }));
    } catch (err) {
      console.warn("[SecretScanner] gitleaks scan failed (tool may not be installed):", err instanceof Error ? err.message : err);
      return [];
    } finally {
      if (existsSync(outPath)) {
        try { unlinkSync(outPath); } catch { /**/ }
      }
    }
  }

  private dedup(findings: SecretFinding[]): SecretFinding[] {
    const seen = new Set<string>();
    return findings.filter((f) => {
      const key = `${f.file}:${f.line}:${f.detector}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
