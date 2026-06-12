import { existsSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class PoetryScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/pyproject.toml`)) return [];

    const raw = this.run("poetry show --outdated --no-ansi", cwd);
    if (!raw) return [];

    const findings: DependencyFinding[] = [];
    const pattern = /^(\S+)\s+([\d.]+)\s+([\d.]+)/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const [, name, current, latest] = match;
      findings.push({
        ecosystem: "poetry",
        packageName: name,
        currentVersion: current,
        latestVersion: latest,
        updateType: this.classifyUpdateType(current, latest),
        vulnerabilities: [],
        breakingChanges: this.isMajorUpdate(current, latest),
        manifestFile: "pyproject.toml",
      });
    }

    return this.dedup(findings);
  }
}
