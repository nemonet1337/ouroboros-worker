import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class CargoScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/Cargo.toml`)) return [];
    const findings: DependencyFinding[] = [];

    const auditRaw = this.run("cargo audit --json", cwd);
    if (auditRaw) {
      try {
        const audit = JSON.parse(auditRaw) as {
          vulnerabilities?: {
            list?: Array<{
              advisory: { id: string; title: string; cvss?: string };
              package: { name: string; version: string };
              versions: { patched: string[] };
            }>;
          };
        };
        for (const item of audit.vulnerabilities?.list ?? []) {
          const cvssScore = parseFloat(item.advisory.cvss ?? "0");
          findings.push({
            ecosystem: "cargo",
            packageName: item.package.name,
            currentVersion: item.package.version,
            latestVersion: item.versions.patched[0] ?? "unknown",
            updateType: "patch",
            vulnerabilities: [
              {
                id: item.advisory.id,
                severity: this.cvssToSeverity(cvssScore),
                cvssScore,
                description: item.advisory.title,
                patchedVersion: item.versions.patched[0] ?? "unknown",
              },
            ],
            breakingChanges: false,
            manifestFile: "Cargo.toml",
          });
        }
      } catch {
        // ignore parse errors
      }
    }

    const outdatedRaw = this.run("cargo outdated --format json", cwd);
    if (outdatedRaw) {
      try {
        const outdated = JSON.parse(outdatedRaw) as {
          dependencies?: Array<{ name: string; project: string; latest: string }>;
        };
        for (const dep of outdated.dependencies ?? []) {
          if (!findings.find((f) => f.packageName === dep.name)) {
            findings.push({
              ecosystem: "cargo",
              packageName: dep.name,
              currentVersion: dep.project,
              latestVersion: dep.latest,
              updateType: this.classifyUpdateType(dep.project, dep.latest),
              vulnerabilities: [],
              breakingChanges: this.isMajorUpdate(dep.project, dep.latest),
              manifestFile: "Cargo.toml",
            });
          }
        }
      } catch {
        // cargo-outdated may not be installed
      }
    }

    return this.dedup(findings);
  }
}
