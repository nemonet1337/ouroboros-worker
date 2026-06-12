import { existsSync } from "node:fs";
import { DependencyFinding, Framework } from "../types";
import { HealingConfig } from "../config/healing.config";
import { FrameworkDetector } from "./framework.detector";
import { NpmScanner } from "./ecosystems/npm.scanner";
import { CargoScanner } from "./ecosystems/cargo.scanner";
import { PubScanner } from "./ecosystems/pub.scanner";
import { GomodScanner } from "./ecosystems/gomod.scanner";
import { MavenScanner } from "./ecosystems/maven.scanner";
import { GradleScanner } from "./ecosystems/gradle.scanner";
import { PipScanner } from "./ecosystems/pip.scanner";
import { PoetryScanner } from "./ecosystems/poetry.scanner";
import { GemScanner } from "./ecosystems/gem.scanner";
import { NugetScanner } from "./ecosystems/nuget.scanner";

export class DependencyScanner {
  constructor(private readonly config: HealingConfig) {}

  async scan(targetDir: string): Promise<{ findings: DependencyFinding[]; frameworks: Framework[] }> {
    const detector = new FrameworkDetector();
    const detected = await detector.detect(targetDir);
    const detectedFrameworks = detected.flatMap((d) => d.frameworks);

    type ScannerEntry = { enabled: boolean; hasManifest: boolean; scanner: () => Promise<DependencyFinding[]> };
    const scanners: ScannerEntry[] = [
      {
        enabled: this.config.targets.typescript.enabled || this.config.targets.javascript.enabled,
        hasManifest: existsSync(`${targetDir}/package.json`),
        scanner: () => new NpmScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.rust.enabled,
        hasManifest: existsSync(`${targetDir}/Cargo.toml`),
        scanner: () => new CargoScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.flutter.enabled,
        hasManifest: existsSync(`${targetDir}/pubspec.yaml`),
        scanner: () => new PubScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.go.enabled,
        hasManifest: existsSync(`${targetDir}/go.mod`),
        scanner: () => new GomodScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.java.enabled,
        hasManifest: existsSync(`${targetDir}/pom.xml`),
        scanner: () => new MavenScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.java.enabled,
        hasManifest: existsSync(`${targetDir}/build.gradle`) || existsSync(`${targetDir}/build.gradle.kts`),
        scanner: () => new GradleScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.python.enabled,
        hasManifest: existsSync(`${targetDir}/requirements.txt`),
        scanner: () => new PipScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.python.enabled,
        hasManifest: existsSync(`${targetDir}/pyproject.toml`),
        scanner: () => new PoetryScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.ruby.enabled,
        hasManifest: existsSync(`${targetDir}/Gemfile`),
        scanner: () => new GemScanner().scan(targetDir),
      },
      {
        enabled: this.config.targets.csharp.enabled,
        hasManifest: true,
        scanner: () => new NugetScanner().scan(targetDir),
      },
    ];

    const active = scanners.filter((s) => s.enabled && s.hasManifest);
    const results = await Promise.allSettled(active.map((s) => s.scanner()));

    const findings: DependencyFinding[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        findings.push(...result.value);
      } else {
        console.error("[DependencyScanner] scanner failed:", result.reason);
      }
    }

    return { findings, frameworks: [...new Set(detectedFrameworks)] };
  }
}
