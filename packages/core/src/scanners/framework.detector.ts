import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Language, Framework, Ecosystem } from "../types";

export interface DetectionResult {
  language: Language;
  frameworks: Framework[];
  packageManagers: Ecosystem[];
  projectDir: string;
}

export class FrameworkDetector {
  async detect(targetDir: string): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];

    // TypeScript / JavaScript
    const pkgJsonPath = `${targetDir}/package.json`;
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };
        const frameworks: Framework[] = [];
        if (allDeps["react"]) frameworks.push("react");
        if (allDeps["vue"]) frameworks.push("vue");
        if (allDeps["@angular/core"]) frameworks.push("angular");
        if (allDeps["next"]) frameworks.push("nextjs");
        if (allDeps["nuxt"]) frameworks.push("nuxtjs");
        if (allDeps["svelte"]) frameworks.push("svelte");
        if (allDeps["express"]) frameworks.push("express");
        if (allDeps["@nestjs/core"]) frameworks.push("nestjs");
        if (allDeps["fastify"]) frameworks.push("fastify");
        if (allDeps["remix"] || allDeps["@remix-run/react"]) frameworks.push("remix");
        if (allDeps["astro"]) frameworks.push("astro");

        const packageManagers: Ecosystem[] = [];
        if (existsSync(`${targetDir}/pnpm-lock.yaml`)) {
          packageManagers.push("pnpm");
        } else if (existsSync(`${targetDir}/yarn.lock`)) {
          packageManagers.push("yarn");
        } else {
          packageManagers.push("npm");
        }

        results.push({
          language: "typescript",
          frameworks,
          packageManagers,
          projectDir: targetDir,
        });
      } catch {
        // ignore
      }
    }

    // Java - Maven
    const pomPath = `${targetDir}/pom.xml`;
    if (existsSync(pomPath)) {
      const content = readFileSync(pomPath, "utf-8");
      const frameworks: Framework[] = [];
      if (content.includes("spring-boot")) frameworks.push("spring-boot");
      if (content.includes("quarkus")) frameworks.push("quarkus");
      if (content.includes("micronaut")) frameworks.push("micronaut");
      results.push({
        language: "java",
        frameworks,
        packageManagers: ["maven"],
        projectDir: targetDir,
      });
    }

    // Java - Gradle
    const gradlePath = existsSync(`${targetDir}/build.gradle.kts`)
      ? `${targetDir}/build.gradle.kts`
      : existsSync(`${targetDir}/build.gradle`)
      ? `${targetDir}/build.gradle`
      : null;
    if (gradlePath) {
      const content = readFileSync(gradlePath, "utf-8");
      const frameworks: Framework[] = [];
      if (content.includes("spring-boot") || content.includes("org.springframework.boot")) frameworks.push("spring-boot");
      if (content.includes("quarkus") || content.includes("io.quarkus")) frameworks.push("quarkus");
      if (!results.find((r) => r.language === "java")) {
        results.push({
          language: "java",
          frameworks,
          packageManagers: ["gradle"],
          projectDir: targetDir,
        });
      }
    }

    // Python - requirements.txt
    const reqPath = `${targetDir}/requirements.txt`;
    if (existsSync(reqPath)) {
      const content = readFileSync(reqPath, "utf-8").toLowerCase();
      const frameworks: Framework[] = [];
      if (content.includes("django")) frameworks.push("django");
      if (content.includes("fastapi")) frameworks.push("fastapi");
      if (content.includes("flask")) frameworks.push("flask");
      if (content.includes("tornado")) frameworks.push("tornado");
      results.push({
        language: "python",
        frameworks,
        packageManagers: ["pip"],
        projectDir: targetDir,
      });
    }

    // Python - pyproject.toml
    const pyprojectPath = `${targetDir}/pyproject.toml`;
    if (existsSync(pyprojectPath) && !results.find((r) => r.language === "python")) {
      const content = readFileSync(pyprojectPath, "utf-8").toLowerCase();
      const frameworks: Framework[] = [];
      if (content.includes("django")) frameworks.push("django");
      if (content.includes("fastapi")) frameworks.push("fastapi");
      if (content.includes("flask")) frameworks.push("flask");
      results.push({
        language: "python",
        frameworks,
        packageManagers: ["poetry"],
        projectDir: targetDir,
      });
    }

    // Ruby - Gemfile
    const gemfilePath = `${targetDir}/Gemfile`;
    if (existsSync(gemfilePath)) {
      const content = readFileSync(gemfilePath, "utf-8");
      const frameworks: Framework[] = [];
      if (content.includes("'rails'") || content.includes('"rails"')) frameworks.push("rails");
      if (content.includes("sinatra")) frameworks.push("sinatra");
      if (content.includes("hanami")) frameworks.push("hanami");
      results.push({
        language: "ruby",
        frameworks,
        packageManagers: ["bundler"],
        projectDir: targetDir,
      });
    }

    // C# - .csproj
    try {
      const csprojFiles = execSync(`find "${targetDir}" -name "*.csproj" -maxdepth 3`, {
        stdio: ["ignore", "pipe", "pipe"],
      })
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean);
      if (csprojFiles.length > 0) {
        const frameworks: Framework[] = [];
        for (const f of csprojFiles) {
          if (!existsSync(f)) continue;
          const content = readFileSync(f, "utf-8");
          if (content.includes("Microsoft.AspNetCore")) frameworks.push("aspnet-core");
          if (content.includes("Microsoft.AspNetCore.Components")) frameworks.push("blazor");
        }
        results.push({
          language: "csharp",
          frameworks: [...new Set(frameworks)],
          packageManagers: ["nuget"],
          projectDir: targetDir,
        });
      }
    } catch {
      // ignore
    }

    // Go - go.mod
    const goModPath = `${targetDir}/go.mod`;
    if (existsSync(goModPath)) {
      const content = readFileSync(goModPath, "utf-8");
      const frameworks: Framework[] = [];
      if (content.includes("github.com/gin-gonic/gin")) frameworks.push("gin");
      if (content.includes("github.com/labstack/echo")) frameworks.push("echo");
      if (content.includes("github.com/gofiber/fiber")) frameworks.push("fiber");
      if (content.includes("github.com/go-chi/chi")) frameworks.push("chi");
      if (content.includes("github.com/gorilla/mux")) frameworks.push("gorilla-mux");
      results.push({
        language: "go",
        frameworks,
        packageManagers: ["gomod"],
        projectDir: targetDir,
      });
    }

    // C++ - CMakeLists.txt
    const cmakePath = `${targetDir}/CMakeLists.txt`;
    if (existsSync(cmakePath)) {
      const content = readFileSync(cmakePath, "utf-8");
      const frameworks: Framework[] = [];
      if (content.includes("find_package(Qt") || content.includes("Qt5") || content.includes("Qt6")) frameworks.push("qt");
      if (content.includes("find_package(Boost")) frameworks.push("boost");
      results.push({
        language: "cpp",
        frameworks,
        packageManagers: ["vcpkg"],
        projectDir: targetDir,
      });
    }

    // Flutter - pubspec.yaml
    const pubspecPath = `${targetDir}/pubspec.yaml`;
    if (existsSync(pubspecPath)) {
      const content = readFileSync(pubspecPath, "utf-8");
      if (content.includes("flutter:")) {
        results.push({
          language: "flutter",
          frameworks: [],
          packageManagers: ["pub"],
          projectDir: targetDir,
        });
      }
    }

    // Rust - Cargo.toml
    const cargoPath = `${targetDir}/Cargo.toml`;
    if (existsSync(cargoPath)) {
      results.push({
        language: "rust",
        frameworks: [],
        packageManagers: ["cargo"],
        projectDir: targetDir,
      });
    }

    return results;
  }
}
