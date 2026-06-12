import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class PipScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/requirements.txt`)) return [];
    const findings: DependencyFinding[] = [];

    const auditRaw = this.run("pip-audit --format json", cwd);
    if (auditRaw) {
      try {
        const audit = JSON.parse(auditRaw) as {
          dependencies?: Array<{
            name: string;
            version: string;
            vulns: Array<{ id: string; fix_versions: string[]; description: string }>;
          }>;
        };
        for (const dep of audit.dependencies ?? []) {
          if (!dep.vulns.length) continue;
          findings.push({
            ecosystem: "pip",
            packageName: dep.name,
            currentVersion: dep.version,
            latestVersion: dep.vulns[0]?.fix_versions[0] ?? "unknown",
            updateType: "patch",
            vulnerabilities: dep.vulns.map((v) => ({
              id: v.id,
              severity: "medium",
              cvssScore: 0,
              description: v.description,
              patchedVersion: v.fix_versions[0] ?? "unknown",
            })),
            breakingChanges: false,
            manifestFile: "requirements.txt",
          });
        }
      } catch {
        // ignore parse errors
      }
    }

    const outdatedRaw = this.run("pip list --outdated --format json", cwd);
    if (outdatedRaw) {
      try {
        const outdated = JSON.parse(outdatedRaw) as Array<{
          name: string;
          version: string;
          latest_version: string;
        }>;
        for (const pkg of outdated) {
          if (!findings.find((f) => f.packageName.toLowerCase() === pkg.name.toLowerCase())) {
            findings.push({
              ecosystem: "pip",
              packageName: pkg.name,
              currentVersion: pkg.version,
              latestVersion: pkg.latest_version,
              updateType: this.classifyUpdateType(pkg.version, pkg.latest_version),
              vulnerabilities: [],
              breakingChanges: this.isMajorUpdate(pkg.version, pkg.latest_version),
              manifestFile: "requirements.txt",
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    return this.dedup(findings);
  }
}
