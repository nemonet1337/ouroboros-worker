import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { LicenseScanner } from "../scanners/license.scanner";
import { defaultHealingConfig } from "../config/healing.config";

describe("LicenseScanner", () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = resolve(tmpdir(), `ouro-license-test-${Date.now()}`);
    mkdirSync(tempRepo, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempRepo)) {
      rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it("should return empty if licenseCheckEnabled is false", async () => {
    const config = {
      ...defaultHealingConfig,
      scan: { ...defaultHealingConfig.scan, licenseCheckEnabled: false }
    };
    
    // Create mock package.json
    writeFileSync(
      resolve(tempRepo, "package.json"),
      JSON.stringify({
        dependencies: { "some-pkg": "1.0.0" }
      })
    );

    const scanner = new LicenseScanner(config);
    const findings = await scanner.scan(tempRepo);
    expect(findings).toEqual([]);
  });

  it("should find GPL/AGPL packages in node_modules", async () => {
    const config = {
      ...defaultHealingConfig,
      scan: { ...defaultHealingConfig.scan, licenseCheckEnabled: true }
    };

    // Create mock package.json
    writeFileSync(
      resolve(tempRepo, "package.json"),
      JSON.stringify({
        dependencies: { "gpl-lib": "1.0.0", "mit-lib": "2.0.0" }
      })
    );

    // Create mock node_modules
    mkdirSync(resolve(tempRepo, "node_modules", "gpl-lib"), { recursive: true });
    mkdirSync(resolve(tempRepo, "node_modules", "mit-lib"), { recursive: true });

    writeFileSync(
      resolve(tempRepo, "node_modules", "gpl-lib", "package.json"),
      JSON.stringify({ name: "gpl-lib", license: "GPL-3.0" })
    );
    writeFileSync(
      resolve(tempRepo, "node_modules", "mit-lib", "package.json"),
      JSON.stringify({ name: "mit-lib", license: "MIT" })
    );

    const scanner = new LicenseScanner(config);
    const findings = await scanner.scan(tempRepo);

    expect(findings.length).toBe(1);
    expect(findings[0].packageName).toBe("gpl-lib");
    expect(findings[0].license).toBe("GPL-3.0");
    expect(findings[0].status).toBe("forbidden");
  });
});
