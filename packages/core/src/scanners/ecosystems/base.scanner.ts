import { execSync } from "node:child_process";
import { CVE, DependencyFinding } from "../../types";

export abstract class BaseEcoScanner {
  protected run(cmd: string, cwd?: string): string {
    try {
      return execSync(cmd, {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 180_000,
        shell: "/bin/sh",
        cwd,
      })
        .toString()
        .trim();
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
      return [e.stdout?.toString().trim(), e.stderr?.toString().trim()]
        .filter(Boolean)
        .join("\n");
    }
  }

  protected classifyUpdateType(current: string, latest: string): "major" | "minor" | "patch" {
    const clean = (v: string) => v.replace(/^v/, "").replace(/-.*$/, "");
    const [cMaj = "0", cMin = "0"] = clean(current).split(".");
    const [lMaj = "0", lMin = "0"] = clean(latest).split(".");
    if (cMaj !== lMaj) return "major";
    if (cMin !== lMin) return "minor";
    return "patch";
  }

  protected isMajorUpdate(current: string, latest: string): boolean {
    return this.classifyUpdateType(current, latest) === "major";
  }

  protected cvssToSeverity(score?: number): "critical" | "high" | "medium" | "low" {
    if (score === undefined) return "low";
    if (score >= 9.0) return "critical";
    if (score >= 7.0) return "high";
    if (score >= 4.0) return "medium";
    return "low";
  }

  protected async queryOSV(
    packages: Array<{ name: string; version: string; ecosystem: string }>
  ): Promise<CVE[]> {
    const cves: CVE[] = [];
    const batchSize = 10;

    for (let i = 0; i < packages.length; i += batchSize) {
      const batch = packages.slice(i, i + batchSize);
      const queries = batch.map((p) => ({
        package: { name: p.name, ecosystem: p.ecosystem },
        version: p.version,
      }));

      try {
        const res = await fetch("https://api.osv.dev/v1/querybatch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;

        const data = (await res.json()) as { results: Array<{ vulns?: Array<{ id: string; severity?: Array<{ score: string }>; summary?: string; database_specific?: { severity?: string } }> }> };
        for (let j = 0; j < data.results.length; j++) {
          const result = data.results[j];
          const pkg = batch[j];
          for (const vuln of result.vulns ?? []) {
            const cvssScore = parseFloat(vuln.severity?.[0]?.score ?? "0");
            const dbSeverity = vuln.database_specific?.severity?.toLowerCase() as CVE["severity"] | undefined;
            cves.push({
              id: vuln.id,
              severity: dbSeverity ?? this.cvssToSeverity(cvssScore),
              cvssScore,
              description: vuln.summary ?? "",
              patchedVersion: pkg.version,
            });
          }
        }
      } catch {
        // OSV API failure is non-fatal
      }
    }
    return cves;
  }

  protected dedup(findings: DependencyFinding[]): DependencyFinding[] {
    const seen = new Map<string, DependencyFinding>();
    for (const f of findings) {
      const key = `${f.packageName}@${f.currentVersion}`;
      if (!seen.has(key)) seen.set(key, f);
    }
    return [...seen.values()];
  }
}
