import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class GemScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/Gemfile`)) return [];
    const findings: DependencyFinding[] = [];

    const auditRaw = this.run("bundle-audit check --update", cwd);
    if (auditRaw) {
      const namePattern = /Name:\s+(\S+)/g;
      const versionPattern = /Version:\s+(\S+)/g;
      const advisoryPattern = /Advisory:\s+(\S+)/g;
      const solutionPattern = /Solution:\s+(.+)/g;

      const names = [...auditRaw.matchAll(namePattern)].map((m) => m[1]);
      const versions = [...auditRaw.matchAll(versionPattern)].map((m) => m[1]);
      const advisories = [...auditRaw.matchAll(advisoryPattern)].map((m) => m[1]);
      const solutions = [...auditRaw.matchAll(solutionPattern)].map((m) => m[1]);

      for (let i = 0; i < names.length; i++) {
        findings.push({
          ecosystem: "gem",
          packageName: names[i] ?? "unknown",
          currentVersion: versions[i] ?? "unknown",
          latestVersion: "unknown",
          updateType: "patch",
          vulnerabilities: [
            {
              id: advisories[i] ?? "unknown",
              severity: "medium",
              cvssScore: 0,
              description: solutions[i] ?? "",
              patchedVersion: "unknown",
            },
          ],
          breakingChanges: false,
          manifestFile: "Gemfile",
        });
      }
    }

    const outdatedRaw = this.run("bundle outdated --parseable", cwd);
    if (outdatedRaw) {
      const pattern = /^(\S+) \(newest ([\d.]+), installed ([\d.]+)/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(outdatedRaw)) !== null) {
        const [, name, latest, current] = match;
        if (!findings.find((f) => f.packageName === name)) {
          findings.push({
            ecosystem: "gem",
            packageName: name,
            currentVersion: current,
            latestVersion: latest,
            updateType: this.classifyUpdateType(current, latest),
            vulnerabilities: [],
            breakingChanges: this.isMajorUpdate(current, latest),
            manifestFile: "Gemfile",
          });
        }
      }
    }

    return this.dedup(findings);
  }
}
