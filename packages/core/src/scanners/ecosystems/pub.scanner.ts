import { existsSync, readFileSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class PubScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    const pubspec = `${cwd}/pubspec.yaml`;
    if (!existsSync(pubspec)) return [];

    const isFlutter = readFileSync(pubspec, "utf-8").includes("flutter:");
    const cmd = isFlutter
      ? "flutter pub outdated --json"
      : "dart pub outdated --json";

    const raw = this.run(cmd, cwd);
    if (!raw) return [];

    try {
      const data = JSON.parse(raw) as {
        packages?: Array<{
          package: string;
          current?: { version: string };
          latest?: { version: string };
          upgradable?: { version: string };
        }>;
      };

      const findings: DependencyFinding[] = [];
      for (const pkg of data.packages ?? []) {
        const current = pkg.current?.version ?? "0.0.0";
        const latest = pkg.latest?.version ?? current;
        if (current === latest) continue;
        findings.push({
          ecosystem: "pub",
          packageName: pkg.package,
          currentVersion: current,
          latestVersion: latest,
          updateType: this.classifyUpdateType(current, latest),
          vulnerabilities: [],
          breakingChanges: this.isMajorUpdate(current, latest),
          manifestFile: "pubspec.yaml",
        });
      }
      return this.dedup(findings);
    } catch {
      return [];
    }
  }
}
