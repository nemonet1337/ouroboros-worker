import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as Diff from "diff";
import type { AiProvider } from "../ports/ai";
import {
  FixResult,
  FindingGroup,
  Language,
  ValidationResult,
  Patch,
  CodeQLFinding,
  DependencyFinding,
  SecretFinding,
  PerformanceFinding,
} from "../types";
import { HealingConfig } from "../config/healing.config";

type AnyFinding = CodeQLFinding | DependencyFinding | PerformanceFinding | SecretFinding;

// Fix: resolve repo root so file paths from CodeQL SARIF (relative to repo root)
// are resolved correctly even when the process runs from .self-healing/
const REPO_ROOT = (() => {
  if (process.env.GITHUB_WORKSPACE) return process.env.GITHUB_WORKSPACE;
  try {
    return execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return process.cwd();
  }
})();

const SYSTEM_PROMPT = `You are an expert software engineer specialising in security fixes and dependency updates.
You write minimal, surgical patches that fix only the reported issue.
You are fluent in TypeScript, JavaScript, Rust, Dart/Flutter, Go, C#, C++, Java, Python, and Ruby,
and familiar with their major frameworks including React, Vue, Next.js, Express, NestJS,
Spring Boot, Quarkus, Django, FastAPI, Flask, Rails, Gin, Echo, Fiber, ASP.NET Core, and Qt.`;

const VALIDATE_COMMANDS: Record<Language, string> = {
  typescript: "npx tsc --noEmit && npx eslint . --ext .ts,.tsx --max-warnings 0",
  javascript: "npx eslint . --ext .js,.jsx,.mjs --max-warnings 0",
  rust: "cargo check && cargo clippy -- -D warnings",
  flutter: "flutter analyze && dart format --set-exit-if-changed .",
  go: "go build ./... && go vet ./...",
  csharp: "dotnet build --configuration Release --no-restore",
  cpp: "cmake --build build --config Release",
  java: "(mvn -q compile -DskipTests) || (./gradlew compileJava)",
  python: "ruff check . && mypy . --ignore-missing-imports",
  ruby: "bundle exec rubocop --format progress",
};

const LANGUAGE_GUIDELINES: Record<Language, string> = {
  typescript:
    "Use strict TypeScript types (no 'any'). Follow React Hooks rules and exhaustive deps. Use Vue Composition API patterns. Apply NestJS dependency injection. Always use async/await.",
  javascript:
    "Use const/let (never var). Use async/await. Sanitize DOM operations (no innerHTML with user input). Use modern ES modules.",
  rust:
    "Never use unsafe blocks. Use Result<T, E> for error handling. Follow Clippy lints. Never use unwrap() in production code. Prefer iterators over loops.",
  flutter:
    "Null safety is mandatory. Use const constructors where possible. Follow Riverpod/BLoC state management patterns. Avoid setState in complex widgets.",
  go: "Always check error return values. Pass context.Context as first argument. Prevent goroutine leaks with context cancellation. Use table-driven tests.",
  java: "Use constructor injection (not field injection). Return Optional<T> instead of null. Follow Spring Security CSRF configuration. Avoid N+1 queries with proper fetching strategies.",
  python:
    "Add type hints to all functions. Use Django select_related/prefetch_related to avoid N+1. Use FastAPI Pydantic v2 models. Never use shell=True in subprocess.",
  ruby: "Use strong parameters for mass assignment. Use ActiveRecord query interface (avoid raw SQL). Avoid N+1 with includes(). Follow Rails conventions.",
  csharp:
    "Enable nullable reference types. Use async/await (never .Result or .Wait()). Apply FluentValidation. Follow ASP.NET Core middleware ordering best practices.",
  cpp: "Use smart pointers (unique_ptr, shared_ptr). Apply RAII principles. Maintain const correctness. Avoid undefined behavior and banned C functions.",
};

export class AIFixer {
  constructor(
    private readonly config: HealingConfig,
    private readonly ai: AiProvider
  ) {}

  async fix(group: FindingGroup): Promise<FixResult> {
    if (!group.autoFixable) {
      return { success: false, appliedPatches: [], failedFindings: [group], validationOutput: "marked non-auto-fixable", iterations: 0 };
    }

    // Save originals keyed by repo-root-relative path; read using absolute path
    const originals = new Map<string, string>();
    for (const finding of group.findings) {
      const relPath = this.findingToFile(finding);
      if (!relPath) continue;
      const absPath = resolve(REPO_ROOT, relPath);
      try {
        originals.set(relPath, readFileSync(absPath, "utf-8"));
      } catch {
        // file may not exist yet
      }
    }

    let appliedPatches: Patch[] = [];
    let lastValidation = "";

    for (let attempt = 0; attempt < this.config.ai.maxRetries; attempt++) {
      if (attempt > 0) {
        // Restore originals before each retry
        for (const [relPath, content] of originals) {
          writeFileSync(resolve(REPO_ROOT, relPath), content, "utf-8");
        }
        appliedPatches = [];
      }

      for (const finding of group.findings) {
        const patch = await this.generatePatch(finding, lastValidation, group);
        if (!patch) continue;
        writeFileSync(resolve(REPO_ROOT, patch.file), patch.fixedContent, "utf-8");
        appliedPatches.push(patch);
      }

      const languages = this.detectLanguages(group);
      const validations = await Promise.all(languages.map((lang) => this.validate(lang)));
      const failed = validations.find((v) => !v.success);

      if (!failed) {
        return { success: true, appliedPatches, failedFindings: [], validationOutput: "all checks passed", iterations: attempt + 1 };
      }
      lastValidation = failed.output;
      console.warn(`[AIFixer] attempt ${attempt + 1} failed:\n${failed.output.slice(0, 500)}`);
    }

    // Restore originals on total failure
    for (const [relPath, content] of originals) {
      writeFileSync(resolve(REPO_ROOT, relPath), content, "utf-8");
    }
    return { success: false, appliedPatches: [], failedFindings: [group], validationOutput: lastValidation, iterations: this.config.ai.maxRetries };
  }

  private async generatePatch(
    finding: AnyFinding,
    lastValidationError: string,
    group: FindingGroup
  ): Promise<Patch | null> {
    const relPath = this.findingToFile(finding);
    if (!relPath) return null;

    const absPath = resolve(REPO_ROOT, relPath);
    let originalContent: string;
    try {
      originalContent = readFileSync(absPath, "utf-8");
    } catch {
      return null;
    }

    const codeqlFinding = finding as CodeQLFinding;
    const startLine = Math.max(0, (codeqlFinding.location?.startLine ?? 1) - this.config.ai.contextLines);
    const endLine = (codeqlFinding.location?.endLine ?? 999) + this.config.ai.contextLines;
    const snippet = originalContent.split("\n").slice(startLine, endLine).join("\n");

    const language = group.language ?? codeqlFinding.language;
    const langGuideline = language ? LANGUAGE_GUIDELINES[language] : "";

    const prompt = this.buildFixPrompt(finding, relPath, snippet, originalContent, langGuideline, lastValidationError);

    try {
      const responseText = await this.ai.complete({
        model: this.config.ai.model,
        maxTokens: 8192,
        system: SYSTEM_PROMPT,
        prompt,
      });

      const fixedContent = this.extractCode(responseText);
      if (!fixedContent || fixedContent === originalContent) return null;

      return {
        file: relPath, // repo-root-relative path; used for git add
        originalContent,
        fixedContent,
        diff: Diff.createPatch(relPath, originalContent, fixedContent),
        explanation: this.extractExplanation(responseText),
      };
    } catch (err) {
      console.error("[AIFixer] generatePatch failed:", err);
      return null;
    }
  }

  private buildFixPrompt(
    finding: AnyFinding,
    filePath: string,
    snippet: string,
    fullFile: string,
    langGuideline: string,
    prevError: string
  ): string {
    const errorSection = prevError
      ? `\n## Previous Fix Attempt Failed\n\`\`\`\n${prevError.slice(0, 2000)}\n\`\`\`\nPlease fix the above error as well.\n`
      : "";

    return `# Code Fix Request

## Finding
\`\`\`json
${JSON.stringify(finding, null, 2)}
\`\`\`

## File: ${filePath}
${langGuideline ? `\n## Language Guidelines\n${langGuideline}\n` : ""}
## Relevant Code (context)
\`\`\`
${snippet}
\`\`\`

## Full File Content
\`\`\`
${fullFile}
\`\`\`
${errorSection}
## Instructions
1. FIX ONLY the reported issue. Do NOT refactor unrelated code.
2. Output the COMPLETE fixed file content inside <fixed_file> tags.
3. Output a brief explanation inside <explanation> tags.
4. Preserve all existing comments, formatting style, and line endings.
5. For dependency updates: update only the version string in the manifest file.
`;
  }

  async validate(language: Language): Promise<ValidationResult> {
    const cmd = VALIDATE_COMMANDS[language];
    const cwd = this.resolveWorkdir(language);
    try {
      const output = execSync(cmd, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: "/bin/sh",
        timeout: 120_000,
        cwd,
      }).toString();
      return { success: true, output };
    } catch (err: unknown) {
      const e = err as { stdout?: Buffer; stderr?: Buffer; message?: string };
      return {
        success: false,
        output: [e.stdout?.toString(), e.stderr?.toString(), e.message].filter(Boolean).join("\n"),
      };
    }
  }

  detectLanguages(group: FindingGroup): Language[] {
    if (group.language) return [group.language];

    const langs = new Set<Language>();
    for (const f of group.findings) {
      const file = (f as CodeQLFinding).location?.file ?? "";
      const lang = this.fileToLanguage(file);
      if (lang) langs.add(lang);

      const eco = (f as DependencyFinding).ecosystem;
      const ecoLang = this.ecosystemToLanguage(eco);
      if (ecoLang) langs.add(ecoLang);
    }
    return langs.size ? [...langs] : ["typescript"];
  }

  private fileToLanguage(file: string): Language | undefined {
    if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
    if (file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".mjs") || file.endsWith(".cjs")) return "javascript";
    if (file.endsWith(".rs")) return "rust";
    if (file.endsWith(".dart")) return "flutter";
    if (file.endsWith(".go")) return "go";
    if (file.endsWith(".cs") || file.endsWith(".csx")) return "csharp";
    if (file.endsWith(".cpp") || file.endsWith(".cc") || file.endsWith(".cxx") || file.endsWith(".c") || file.endsWith(".h") || file.endsWith(".hpp")) return "cpp";
    if (file.endsWith(".java") || file.endsWith(".kt") || file.endsWith(".kts")) return "java";
    if (file.endsWith(".py") || file.endsWith(".pyw")) return "python";
    if (file.endsWith(".rb") || file.endsWith(".rake") || file.endsWith(".gemspec")) return "ruby";
    return undefined;
  }

  private ecosystemToLanguage(eco?: string): Language | undefined {
    if (!eco) return undefined;
    const map: Record<string, Language> = {
      npm: "typescript", yarn: "typescript", pnpm: "typescript",
      cargo: "rust",
      pub: "flutter",
      gomod: "go",
      maven: "java", gradle: "java",
      pip: "python", poetry: "python", conda: "python",
      gem: "ruby", bundler: "ruby",
      nuget: "csharp",
      vcpkg: "cpp", conan: "cpp",
    };
    return map[eco];
  }

  private findingToFile(finding: AnyFinding): string | undefined {
    const codeql = finding as CodeQLFinding;
    if (codeql.location?.file) return codeql.location.file;

    const dep = finding as DependencyFinding;
    if (dep.manifestFile) return dep.manifestFile;
    if (dep.ecosystem) return this.ecosystemToManifest(dep.ecosystem);

    return undefined;
  }

  private ecosystemToManifest(ecosystem: string): string {
    const map: Record<string, string> = {
      npm: "package.json", yarn: "package.json", pnpm: "package.json",
      cargo: "Cargo.toml",
      pub: "pubspec.yaml",
      gomod: "go.mod",
      maven: "pom.xml",
      gradle: "build.gradle",
      pip: "requirements.txt",
      poetry: "pyproject.toml",
      gem: "Gemfile", bundler: "Gemfile",
      nuget: "*.csproj",
    };
    return map[ecosystem] ?? "package.json";
  }

  private extractCode(response: string): string | null {
    const match = response.match(/<fixed_file>([\s\S]*?)<\/fixed_file>/);
    return match ? match[1].trim() : null;
  }

  private extractExplanation(response: string): string {
    const match = response.match(/<explanation>([\s\S]*?)<\/explanation>/);
    return match ? match[1].trim() : "AI-generated fix";
  }

  private resolveWorkdir(language: Language): string {
    const envKey: Partial<Record<Language, string>> = {
      typescript: "TS_PROJECT_DIR",
      javascript: "JS_PROJECT_DIR",
      rust: "RUST_PROJECT_DIR",
      flutter: "FLUTTER_PROJECT_DIR",
      go: "GO_PROJECT_DIR",
      java: "JAVA_PROJECT_DIR",
      python: "PYTHON_PROJECT_DIR",
      ruby: "RUBY_PROJECT_DIR",
      csharp: "CSHARP_PROJECT_DIR",
      cpp: "CPP_PROJECT_DIR",
    };
    const projectDir = process.env[envKey[language] ?? ""];
    return projectDir ? resolve(REPO_ROOT, projectDir) : REPO_ROOT;
  }
}
