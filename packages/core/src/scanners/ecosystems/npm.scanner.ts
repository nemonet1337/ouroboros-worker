import { existsSync } from "node:fs";
import { DependencyFinding, CVE } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class NpmScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/package.json`)) return [];
    const findings: DependencyFinding[] = [];

    const outdatedRaw = this.run("npm outdated --json", cwd);
    if (outdatedRaw) {
      try {
        const outdated = JSON.parse(outdatedRaw) as Record<
          string,
          { current: string; latest: string }
        >;
        for (const [name, info] of Object.entries(outdated)) {
          findings.push({
            ecosystem: "npm",
            packageName: name,
            currentVersion: info.current,
            latestVersion: info.latest,
            updateType: this.classifyUpdateType(info.current, info.latest),
            vulnerabilities: [],
            breakingChanges: this.isMajorUpdate(info.current, info.latest),
            manifestFile: "package.json",
          });
        }
      } catch {
        // ignore parse errors
      }
    }

    const auditRaw = this.run("npm audit --json", cwd);
    if (auditRaw) {
      try {
        const audit = JSON.parse(auditRaw) as {
          vulnerabilities?: Record<
            string,
            {
              range: string;
              severity: string;
              fixAvailable?: { version?: string };
              via: unknown[];
            }
          >;
        };
        for (const [name, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
          const cves = this.extractNpmCVEs(vuln);
          const existing = findings.find((f) => f.packageName === name);
          if (existing) {
            existing.vulnerabilities.push(...cves);
          } else {
            findings.push({
              ecosystem: "npm",
              packageName: name,
              currentVersion: vuln.range ?? "unknown",
              latestVersion: vuln.fixAvailable?.version ?? "unknown",
              updateType: "patch",
              vulnerabilities: cves,
              breakingChanges: false,
              manifestFile: "package.json",
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return this.dedup(findings);
  }

  private extractNpmCVEs(vuln: {
    range: string;
    severity: string;
    fixAvailable?: { version?: string };
    via: unknown[];
  }): CVE[] {
    const severity = vuln.severity as CVE["severity"];
    return (vuln.via ?? [])
      .filter((v): v is { cve?: string; url?: string; title?: string; cvss?: { score?: number } } =>
        typeof v === "object" && v !== null && ("cve" in v || "url" in v)
      )
      .map((v) => ({
        id: v.cve ?? v.url ?? "unknown",
        severity,
        cvssScore: v.cvss?.score ?? 0,
        description: v.title ?? "",
        patchedVersion: vuln.fixAvailable?.version ?? "unknown",
      }));
  }
}
