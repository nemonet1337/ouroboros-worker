import { describe, it, expect } from "vitest";
import { AIFixer } from "../fixers/ai.fixer";
import { defaultHealingConfig } from "../config/healing.config";
import { FindingGroup, Language } from "../types";
import { mockAi } from "./helpers";

function makeGroup(overrides: Partial<FindingGroup> = {}): FindingGroup {
  return {
    id: "test-group",
    priority: "high",
    findings: [],
    autoFixable: true,
    estimatedRisk: "テストリスク",
    fixStrategy: {
      title: "テスト修正",
      steps: ["ステップ1"],
      rationale: "テスト根拠",
    },
    ...overrides,
  };
}

describe("AIFixer", () => {
  it("constructs without error", () => {
    expect(new AIFixer(defaultHealingConfig, mockAi())).toBeDefined();
  });

  it("returns failure immediately for non-auto-fixable groups", async () => {
    const fixer = new AIFixer(defaultHealingConfig, mockAi());
    const result = await fixer.fix(makeGroup({ autoFixable: false }));
    expect(result.success).toBe(false);
    expect(result.appliedPatches).toEqual([]);
    expect(result.iterations).toBe(0);
  });

  it("detectLanguages falls back to typescript for groups with no findings", () => {
    const fixer = new AIFixer(defaultHealingConfig, mockAi());
    const group = makeGroup({ findings: [] });
    const langs = fixer.detectLanguages(group);
    expect(langs).toEqual(["typescript"]);
  });

  it("detectLanguages returns language set from the group's explicit language field", () => {
    const fixer = new AIFixer(defaultHealingConfig, mockAi());
    const langs = fixer.detectLanguages(makeGroup({ language: "go" }));
    expect(langs).toEqual(["go"]);
  });

  it("detectLanguages infers from CodeQL file extensions", () => {
    const fixer = new AIFixer(defaultHealingConfig, mockAi());
    const extMap: Array<[string, Language]> = [
      ["app.ts", "typescript"],
      ["app.tsx", "typescript"],
      ["app.js", "javascript"],
      ["app.mjs", "javascript"],
      ["main.rs", "rust"],
      ["main.go", "go"],
      ["Main.java", "java"],
      ["app.py", "python"],
      ["app.rb", "ruby"],
      ["App.cs", "csharp"],
      ["main.cpp", "cpp"],
      ["widget.dart", "flutter"],
    ];

    for (const [file, expectedLang] of extMap) {
      const group = makeGroup({
        findings: [
          {
            ruleId: "test",
            severity: "warning",
            message: "test",
            location: { file, startLine: 1, endLine: 1, snippet: "" },
          },
        ],
      });
      expect(fixer.detectLanguages(group), `file: ${file}`).toContain(expectedLang);
    }
  });

  it("detectLanguages infers from dependency ecosystem", () => {
    const fixer = new AIFixer(defaultHealingConfig, mockAi());
    const ecoMap: Array<[string, Language]> = [
      ["npm", "typescript"],
      ["yarn", "typescript"],
      ["pnpm", "typescript"],
      ["cargo", "rust"],
      ["pub", "flutter"],
      ["gomod", "go"],
      ["maven", "java"],
      ["gradle", "java"],
      ["pip", "python"],
      ["poetry", "python"],
      ["gem", "ruby"],
      ["bundler", "ruby"],
      ["nuget", "csharp"],
    ];

    for (const [eco, expectedLang] of ecoMap) {
      const group = makeGroup({
        findings: [
          {
            ecosystem: eco as never,
            packageName: "test-pkg",
            currentVersion: "1.0.0",
            latestVersion: "1.0.1",
            updateType: "patch",
            vulnerabilities: [],
            breakingChanges: false,
          },
        ],
      });
      expect(fixer.detectLanguages(group), `eco: ${eco}`).toContain(expectedLang);
    }
  });
});
