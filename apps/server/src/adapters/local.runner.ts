import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  AIFixer,
  CodeQLScanner,
  DependencyScanner,
  PerformanceScanner,
  SecretScanner,
  LicenseScanner,
} from "@ouroboros/core/node";
import type {
  AiProvider,
  AllFindings,
  HealingConfig,
  HealingRunner,
  RunFixOptions,
  RunnerFixResult,
  RunnerScanResult,
} from "@ouroboros/core";

/**
 * Filesystem/git/compiler-heavy healing implementation for the self-hosted
 * deployment. Runs the scanners in-process and uses AIFixer + git to apply,
 * validate, commit and push fixes. This same class is the target of the
 * Cloudflare DispatchRunner via the /internal/heal endpoint.
 */
export class LocalRunner implements HealingRunner {
  readonly kind = "local" as const;

  constructor(
    private readonly config: HealingConfig,
    private readonly ai: AiProvider,
    private readonly repoRoot: string
  ) {}

  async scan(): Promise<RunnerScanResult> {
    const [codeql, perf, secret, dep, license] = await Promise.allSettled([
      new CodeQLScanner().scan(this.repoRoot),
      new PerformanceScanner(this.config).scan(this.repoRoot),
      new SecretScanner(this.config).scan(),
      new DependencyScanner(this.config).scan(this.repoRoot),
      new LicenseScanner(this.config).scan(this.repoRoot),
    ]);

    const depData = dep.status === "fulfilled" ? dep.value : { findings: [], frameworks: [] };
    const findings: AllFindings = {
      codeql: codeql.status === "fulfilled" ? codeql.value : [],
      dependency: depData.findings,
      performance: perf.status === "fulfilled" ? perf.value : [],
      secrets: secret.status === "fulfilled" ? secret.value : [],
      licenses: license.status === "fulfilled" ? license.value : [],
      detectedFrameworks: depData.frameworks,
      timestamp: new Date(),
      commitHash: process.env.GITHUB_SHA ?? "local",
    };
    return { findings };
  }

  async applyFix(opts: RunFixOptions): Promise<RunnerFixResult> {
    const fixer = new AIFixer(this.config, this.ai);
    const result = await fixer.fix(opts.group);

    if (!result.success || result.appliedPatches.length === 0) {
      return {
        success: false,
        patches: result.appliedPatches,
        validationOutput: result.validationOutput,
        iterations: result.iterations,
      };
    }

    if (opts.dryRun) {
      // leave patches uncommitted; orchestrator only logs the diff
      return {
        success: true,
        patches: result.appliedPatches,
        validationOutput: result.validationOutput,
        iterations: result.iterations,
      };
    }

    const branch = this.branchName(opts);
    this.commitAndPush(branch, opts, result.appliedPatches.map((p) => p.file), result.iterations);
    return {
      success: true,
      patches: result.appliedPatches,
      branch,
      validationOutput: result.validationOutput,
      iterations: result.iterations,
    };
  }

  private branchName(opts: RunFixOptions): string {
    const slug = opts.group.id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    return `${opts.branchPrefix}${opts.group.priority}/${slug}-${Date.now()}`;
  }

  private commitAndPush(branch: string, opts: RunFixOptions, files: string[], iterations: number): void {
    const run = (cmd: string) => execSync(cmd, { stdio: "inherit", timeout: 60_000, cwd: this.repoRoot });
    const commitMsg = [
      `fix(self-healing): ${opts.group.fixStrategy.title}`,
      "",
      `Priority: ${opts.group.priority}`,
      `Files: ${files.join(", ")}`,
      `Iterations: ${iterations}`,
    ].join("\n");

    const msgFile = resolve(tmpdir(), `heal-commit-${Date.now()}.txt`);
    writeFileSync(msgFile, commitMsg, "utf-8");
    try {
      run(`git checkout -b "${branch}"`);
      for (const file of files) run(`git add "${file}"`);
      run(`git commit -F "${msgFile}"`);
      run(`git push origin "${branch}"`);
      run(`git checkout "${opts.baseBranch}"`);
    } finally {
      try { unlinkSync(msgFile); } catch { /* ignore */ }
    }
  }
}
