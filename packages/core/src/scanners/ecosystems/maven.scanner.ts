import { existsSync, readFileSync } from "node:fs";
import { DependencyFinding } from "../../types";
import { BaseEcoScanner } from "./base.scanner";

export class MavenScanner extends BaseEcoScanner {
  async scan(cwd: string): Promise<DependencyFinding[]> {
    if (!existsSync(`${cwd}/pom.xml`)) return [];
    const findings: DependencyFinding[] = [];

    const raw = this.run(
      "mvn -q versions:display-dependency-updates -DprocessDependencyManagement=false",
      cwd
    );
    const pattern = /(\S+:\S+)\s+\.\.\.\s+([\d.]+)\s+->\s+([\d.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      const [, artifactId, current, latest] = match;
      findings.push({
        ecosystem: "maven",
        packageName: artifactId,
        currentVersion: current,
        latestVersion: latest,
        updateType: this.classifyUpdateType(current, latest),
        vulnerabilities: [],
        breakingChanges: this.isMajorUpdate(current, latest),
        manifestFile: "pom.xml",
      });
    }

    // OWASP Dependency Check report
    const dcReport = `${cwd}/target/dependency-check-report.json`;
    if (existsSync(dcReport)) {
      try {
        const report = JSON.parse(readFileSync(dcReport, "utf-8")) as {
          dependencies?: Array<{
            fileName: string;
            packages?: Array<{ id: string }>;
            vulnerabilities?: Array<{
              name: string;
              cvssv3?: { baseScore: number };
              severity: string;
              description: string;
            }>;
          }>;
        };
        for (const dep of report.dependencies ?? []) {
          for (const vuln of dep.vulnerabilities ?? []) {
            const cvssScore = vuln.cvssv3?.baseScore ?? 0;
            const pkgName = dep.packages?.[0]?.id ?? dep.fileName;
            const existing = findings.find((f) => f.packageName === pkgName);
            const cveEntry = {
              id: vuln.name,
              severity: this.cvssToSeverity(cvssScore),
              cvssScore,
              description: vuln.description,
              patchedVersion: "unknown",
            };
            if (existing) {
              existing.vulnerabilities.push(cveEntry);
            } else {
              findings.push({
                ecosystem: "maven",
                packageName: pkgName,
                currentVersion: "unknown",
                latestVersion: "unknown",
                updateType: "patch",
                vulnerabilities: [cveEntry],
                breakingChanges: false,
                manifestFile: "pom.xml",
              });
            }
          }
        }
      } catch {
        // ignore DC report parse errors
      }
    }

    return this.dedup(findings);
  }
}
