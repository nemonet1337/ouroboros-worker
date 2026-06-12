import { describe, it, expect } from "vitest";
import { CodeQLScanner } from "../scanners/codeql.scanner";
import { DependencyScanner } from "../scanners/dependency.scanner";
import { defaultHealingConfig } from "../config/healing.config";

describe("CodeQLScanner.parseSarif", () => {
  const scanner = new CodeQLScanner();

  it("returns empty array for empty SARIF", () => {
    expect(scanner.parseSarif({})).toEqual([]);
    expect(scanner.parseSarif({ runs: [] })).toEqual([]);
  });

  it("parses a minimal SARIF result", () => {
    const sarif = {
      runs: [
        {
          results: [
            {
              ruleId: "js/sql-injection",
              level: "error",
              message: { text: "SQL injection" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/db.ts" },
                    region: { startLine: 42, endLine: 42, snippet: { text: "db.query(sql)" } },
                  },
                },
              ],
              properties: { tags: ["external/cwe/cwe-089"] },
            },
          ],
          tool: { driver: { rules: [] } },
        },
      ],
    };

    const findings = scanner.parseSarif(sarif);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("js/sql-injection");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toBe("SQL injection");
    expect(findings[0].location.file).toBe("src/db.ts");
    expect(findings[0].location.startLine).toBe(42);
    expect(findings[0].cwe).toEqual(["CWE-089"]);
    expect(findings[0].language).toBe("typescript");
  });

  it("detects language from file extension", () => {
    const makeResult = (uri: string) => ({
      runs: [
        {
          results: [
            {
              ruleId: "test-rule",
              level: "warning",
              message: { text: "test" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri },
                    region: { startLine: 1, endLine: 1 },
                  },
                },
              ],
            },
          ],
          tool: { driver: { rules: [] } },
        },
      ],
    });

    expect(scanner.parseSarif(makeResult("main.go"))[0].language).toBe("go");
    expect(scanner.parseSarif(makeResult("app.py"))[0].language).toBe("python");
    expect(scanner.parseSarif(makeResult("main.rs"))[0].language).toBe("rust");
    expect(scanner.parseSarif(makeResult("Main.java"))[0].language).toBe("java");
    expect(scanner.parseSarif(makeResult("app.rb"))[0].language).toBe("ruby");
    expect(scanner.parseSarif(makeResult("app.dart"))[0].language).toBe("flutter");
    expect(scanner.parseSarif(makeResult("main.cpp"))[0].language).toBe("cpp");
    expect(scanner.parseSarif(makeResult("App.cs"))[0].language).toBe("csharp");
    expect(scanner.parseSarif(makeResult("index.js"))[0].language).toBe("javascript");
    expect(scanner.parseSarif(makeResult("index.mjs"))[0].language).toBe("javascript");
    expect(scanner.parseSarif(makeResult("unknown.txt"))[0].language).toBeUndefined();
  });

  it("maps severity levels correctly", () => {
    const makeResult = (level: string) => ({
      runs: [
        {
          results: [
            {
              ruleId: "r",
              level,
              message: { text: "m" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "f.ts" },
                    region: { startLine: 1, endLine: 1 },
                  },
                },
              ],
            },
          ],
          tool: { driver: { rules: [] } },
        },
      ],
    });

    expect(scanner.parseSarif(makeResult("error"))[0].severity).toBe("error");
    expect(scanner.parseSarif(makeResult("warning"))[0].severity).toBe("warning");
    expect(scanner.parseSarif(makeResult("note"))[0].severity).toBe("note");
    expect(scanner.parseSarif(makeResult("none"))[0].severity).toBe("note");
  });

  it("extracts CWE tags from rule definitions when missing from result", () => {
    const sarif = {
      runs: [
        {
          results: [
            {
              ruleId: "my-rule",
              level: "warning",
              message: { text: "test" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "f.ts" },
                    region: { startLine: 1, endLine: 1 },
                  },
                },
              ],
            },
          ],
          tool: {
            driver: {
              rules: [
                {
                  id: "my-rule",
                  properties: { tags: ["external/cwe/cwe-079", "external/cwe/cwe-116"] },
                },
              ],
            },
          },
        },
      ],
    };

    const findings = scanner.parseSarif(sarif);
    expect(findings[0].cwe).toEqual(["CWE-079", "CWE-116"]);
  });
});

describe("DependencyScanner", () => {
  it("constructs without error", () => {
    expect(new DependencyScanner(defaultHealingConfig)).toBeDefined();
  });

  it("returns empty findings when no manifests exist in temp dir", async () => {
    const scanner = new DependencyScanner(defaultHealingConfig);
    const result = await scanner.scan("/tmp/nonexistent-project-12345");
    expect(result.findings).toEqual([]);
    expect(result.frameworks).toEqual([]);
  });
});
