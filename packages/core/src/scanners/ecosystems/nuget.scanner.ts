import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class NugetScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    const hasCsproj = this.run(`find ${cwd} -name "*.csproj" -maxdepth 3`).trim();
    if (!hasCsproj) return [];

    const findings: DependencyFinding[] = [];
    const raw = this.run("dotnet list package --outdated --format json", cwd);

    if (raw) {
      try {
        const data = JSON.parse(raw) as {
          projects?: Array<{
            frameworks?: Array<{
              topLevelPackages?: Array<{
                id: string;
                resolvedVersion: string;
                latestVersion: string;
              }>;
            }>;
          }>;
        };
        for (const project of data.projects ?? []) {
          for (const framework of project.frameworks ?? []) {
            for (const pkg of framework.topLevelPackages ?? []) {
              findings.push({
                ecosystem: "nuget",
                packageName: pkg.id,
                currentVersion: pkg.resolvedVersion,
                latestVersion: pkg.latestVersion,
                updateType: this.classifyUpdateType(pkg.resolvedVersion, pkg.latestVersion),
                vulnerabilities: [],
                breakingChanges: this.isMajorUpdate(pkg.resolvedVersion, pkg.latestVersion),
                manifestFile: "*.csproj",
              });
            }
          }
        }
      } catch {
        // Fallback: text format parsing
        const pattern = />\s+(\S+)\s+([\d.]+)\s+[\d.]+\s+([\d.]+)/gm;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(raw)) !== null) {
          const [, name, current, latest] = match;
          findings.push({
            ecosystem: "nuget",
            packageName: name,
            currentVersion: current,
            latestVersion: latest,
            updateType: this.classifyUpdateType(current, latest),
            vulnerabilities: [],
            breakingChanges: this.isMajorUpdate(current, latest),
            manifestFile: "*.csproj",
          });
        }
      }
    }

    return this.dedup(findings);
  }

  // Override to use find instead of existsSync for glob pattern
  private hasCsprojFile(cwd: string): boolean {
    const result = this.run(`find "${cwd}" -name "*.csproj" -maxdepth 3`);
    return result.trim().length > 0;
  }
}
