import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class GradleScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    const buildFile =
      existsSync(`${cwd}/build.gradle.kts`) ? "build.gradle.kts" :
      existsSync(`${cwd}/build.gradle`) ? "build.gradle" : null;
    if (!buildFile) return [];

    const gradleCmd = existsSync(`${cwd}/gradlew`) ? "./gradlew" : "gradle";
    const raw = this.run(
      `${gradleCmd} dependencyUpdates -Drevision=release`,
      cwd
    );

    const findings: DependencyFinding[] = [];
    const pattern = /(\S+:\S+)\s+\[(\S+)\s+->\s+(\S+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const [, artifactId, current, latest] = match;
      findings.push({
        ecosystem: "gradle",
        packageName: artifactId,
        currentVersion: current,
        latestVersion: latest,
        updateType: this.classifyUpdateType(current, latest),
        vulnerabilities: [],
        breakingChanges: this.isMajorUpdate(current, latest),
        manifestFile: buildFile,
      });
    }

    return this.dedup(findings);
  }
}
