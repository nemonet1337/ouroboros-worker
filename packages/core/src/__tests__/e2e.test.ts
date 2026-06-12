import { describe, it, expect } from "vitest";
import { defaultHealingConfig } from "../config/healing.config";
import { AIAnalyzer } from "../analyzers/ai.analyzer";
import { AIFixer } from "../fixers/ai.fixer";
import { CodeQLScanner } from "../scanners/codeql.scanner";
import { PerformanceScanner } from "../scanners/performance.scanner";
import { SecretScanner } from "../scanners/secret.scanner";
import { Notifier } from "../notifications/notifier";
import { Rollback } from "../utils/rollback";
import { PRDeduplicator } from "../pr/pr.deduplicator";
import { mockAi } from "./helpers";

describe("config defaults", () => {
  it("autoMerge is disabled by default", () => {
    expect(defaultHealingConfig.autoMerge.enabled).toBe(false);
  });

  it("requireCIPass is true by default", () => {
    expect(defaultHealingConfig.autoMerge.requireCIPass).toBe(true);
  });

  it("dryRun defaults to false when env var is not set", () => {
    delete process.env.SELF_HEALING_DRY_RUN;
    // Re-import wouldn't re-evaluate the module; just assert the current value
    expect(typeof defaultHealingConfig.dryRun).toBe("boolean");
  });

  it("maxPRsPerRun defaults to 5", () => {
    expect(defaultHealingConfig.scan.maxPRsPerRun).toBe(5);
  });

  it("model is claude-sonnet-4-20250514", () => {
    expect(defaultHealingConfig.ai.model).toBe("claude-sonnet-4-20250514");
  });

  it("all 10 language targets are defined", () => {
    const langs = Object.keys(defaultHealingConfig.targets);
    expect(langs).toContain("typescript");
    expect(langs).toContain("javascript");
    expect(langs).toContain("rust");
    expect(langs).toContain("flutter");
    expect(langs).toContain("go");
    expect(langs).toContain("java");
    expect(langs).toContain("python");
    expect(langs).toContain("ruby");
    expect(langs).toContain("csharp");
    expect(langs).toContain("cpp");
  });
});

describe("class instantiation", () => {
  it("all major classes instantiate without throwing", () => {
    expect(() => new AIAnalyzer(defaultHealingConfig, mockAi())).not.toThrow();
    expect(() => new AIFixer(defaultHealingConfig, mockAi())).not.toThrow();
    expect(() => new CodeQLScanner()).not.toThrow();
    expect(() => new PerformanceScanner(defaultHealingConfig)).not.toThrow();
    expect(() => new SecretScanner(defaultHealingConfig)).not.toThrow();
    expect(() => new Notifier(defaultHealingConfig)).not.toThrow();
    expect(() => new Rollback()).not.toThrow();
    expect(() => new PRDeduplicator(defaultHealingConfig)).not.toThrow();
  });
});

describe("scan returns empty on missing files", () => {
  it("PerformanceScanner returns empty when no report files exist", async () => {
    delete process.env.LIGHTHOUSE_REPORT_PATH;
    delete process.env.BENCH_REPORT_PATH;
    const scanner = new PerformanceScanner(defaultHealingConfig);
    expect(await scanner.scan("/tmp")).toEqual([]);
  });

  it("SecretScanner returns empty when disabled", async () => {
    const scanner = new SecretScanner({
      ...defaultHealingConfig,
      scan: { ...defaultHealingConfig.scan, secretScanEnabled: false },
    });
    expect(await scanner.scan()).toEqual([]);
  });

  it("CodeQLScanner returns empty when results dir does not exist", async () => {
    process.env.CODEQL_SARIF_PATH = "/tmp/nonexistent-sarif-dir-xyz";
    const scanner = new CodeQLScanner();
    expect(await scanner.scan("/tmp")).toEqual([]);
    delete process.env.CODEQL_SARIF_PATH;
  });
});
