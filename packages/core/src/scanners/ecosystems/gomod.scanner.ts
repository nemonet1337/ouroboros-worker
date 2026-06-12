import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class GomodScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/go.mod`)) return [];
    const findings: DependencyFinding[] = [];

    // govulncheck for CVEs (NDJSON output)
    const vulnRaw = this.run("govulncheck -json ./...", cwd);
    if (vulnRaw) {
      for (const line of vulnRaw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
          const obj = JSON.parse(trimmed) as {
            finding?: { osv: string; trace?: Array<{ module?: string; version?: string }> };
          };
          if (!obj.finding) continue;
          const trace = obj.finding.trace?.[0];
          if (!trace?.module) continue;
          findings.push({
            ecosystem: "gomod",
            packageName: trace.module,
            currentVersion: trace.version ?? "unknown",
            latestVersion: "unknown",
            updateType: "patch",
            vulnerabilities: [
              {
                id: obj.finding.osv,
                severity: "medium",
                cvssScore: 0,
                description: obj.finding.osv,
                patchedVersion: "unknown",
              },
            ],
            breakingChanges: false,
            manifestFile: "go.mod",
          });
        } catch {
          // skip malformed lines
        }
      }
    }

    // go list for outdated modules (multiple JSON objects concatenated)
    const listRaw = this.run("go list -u -m -json all", cwd);
    if (listRaw) {
      for (const chunk of listRaw.split(/\n(?=\{)/)) {
        if (!chunk.trim().startsWith("{")) continue;
        try {
          const mod = JSON.parse(chunk) as {
            Path: string;
            Version: string;
            Update?: { Version: string };
          };
          if (!mod.Update) continue;
          if (!findings.find((f) => f.packageName === mod.Path)) {
            findings.push({
              ecosystem: "gomod",
              packageName: mod.Path,
              currentVersion: mod.Version,
              latestVersion: mod.Update.Version,
              updateType: this.classifyUpdateType(mod.Version, mod.Update.Version),
              vulnerabilities: [],
              breakingChanges: this.isMajorUpdate(mod.Version, mod.Update.Version),
              manifestFile: "go.mod",
            });
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    return this.dedup(findings);
  }
}
