import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { HealingConfig } from "../config/healing.config";
import type { LicenseFinding } from "../types";

export class LicenseScanner {
  constructor(private readonly config: HealingConfig) {}

  async scan(repoRoot: string): Promise<LicenseFinding[]> {
    if (!this.config.scan.licenseCheckEnabled) {
      return [];
    }

    const findings: LicenseFinding[] = [];
    const pkgPath = resolve(repoRoot, "package.json");
    if (!existsSync(pkgPath)) {
      return [];
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const name of Object.keys(deps)) {
        const depPkgPath = resolve(repoRoot, "node_modules", name, "package.json");
        if (existsSync(depPkgPath)) {
          try {
            const depPkg = JSON.parse(readFileSync(depPkgPath, "utf-8"));
            const license = depPkg.license;
            let licenseStr = "";
            if (typeof license === "string") {
              licenseStr = license;
            } else if (license && typeof license === "object") {
              licenseStr = license.type || "";
            }

            if (licenseStr && (
              licenseStr.toUpperCase().includes("GPL") ||
              licenseStr.toUpperCase().includes("AGPL") ||
              licenseStr.toUpperCase().includes("LGPL")
            )) {
              findings.push({
                type: "license",
                file: "package.json",
                packageName: name,
                license: licenseStr,
                status: "forbidden",
                description: `Forbidden copyleft license found in dependency '${name}': ${licenseStr}`,
              });
            }
          } catch {
            // Ignore corrupted package.json inside node_modules
          }
        }
      }
    } catch (err) {
      console.error("[LicenseScanner] Failed to parse root package.json", err);
    }

    return findings;
  }
}
