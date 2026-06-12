import { existsSync, readdirSync, readFileSync } from "node:fs";
import { CodeQLFinding, Language } from "../types";

export class CodeQLScanner {
  async scan(_targetDir: string): Promise<CodeQLFinding[]> {
    const sarifPath = process.env.CODEQL_SARIF_PATH ?? "./results";
    if (!existsSync(sarifPath)) return [];

    const files = this.collectSarifFiles(sarifPath);
    const allFindings: CodeQLFinding[] = [];
    for (const file of files) {
      try {
        const sarif = JSON.parse(readFileSync(file, "utf-8"));
        allFindings.push(...this.parseSarif(sarif));
      } catch (err) {
        console.error(`[CodeQLScanner] Failed to parse ${file}:`, err);
      }
    }
    return allFindings;
  }

  // Fix: recursively collect .sarif files to handle both flat dirs and nested subdirs
  // (CodeQL action v3 writes into a subdirectory when `output` is a directory path)
  private collectSarifFiles(dirOrFile: string): string[] {
    const files: string[] = [];
    try {
      const entries = readdirSync(dirOrFile, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = `${dirOrFile}/${entry.name}`;
        if (entry.isDirectory()) {
          files.push(...this.collectSarifFiles(fullPath));
        } else if (entry.name.endsWith(".sarif")) {
          files.push(fullPath);
        }
      }
    } catch {
      // dirOrFile is a file path, not a directory
      if (dirOrFile.endsWith(".sarif") && existsSync(dirOrFile)) {
        files.push(dirOrFile);
      }
    }
    return files;
  }

  parseSarif(sarif: unknown): CodeQLFinding[] {
    const s = sarif as {
      runs?: Array<{
        results?: Array<{
          ruleId?: string;
          level?: string;
          message?: { text?: string };
          locations?: Array<{
            physicalLocation?: {
              artifactLocation?: { uri?: string };
              region?: { startLine?: number; endLine?: number; snippet?: { text?: string } };
            };
          }>;
          properties?: { tags?: string[] };
        }>;
        tool?: { driver?: { rules?: Array<{ id?: string; properties?: { tags?: string[] } }> } };
      }>;
    };

    const findings: CodeQLFinding[] = [];
    for (const run of s?.runs ?? []) {
      const ruleTagMap = new Map<string, string[]>();
      for (const rule of run.tool?.driver?.rules ?? []) {
        if (rule.id && rule.properties?.tags) {
          ruleTagMap.set(rule.id, rule.properties.tags);
        }
      }

      for (const result of run.results ?? []) {
        const ruleId = result.ruleId ?? "unknown";
        const tags = result.properties?.tags ?? ruleTagMap.get(ruleId) ?? [];
        const cwe = tags
          .filter((t: string) => t.startsWith("external/cwe/cwe-"))
          .map((t: string) => `CWE-${t.replace("external/cwe/cwe-", "")}`);

        for (const loc of result.locations ?? []) {
          const uri = loc.physicalLocation?.artifactLocation?.uri ?? "";
          findings.push({
            ruleId,
            severity:
              result.level === "error" ? "error"
              : result.level === "warning" ? "warning"
              : "note",
            message: result.message?.text ?? "",
            location: {
              file: uri,
              startLine: loc.physicalLocation?.region?.startLine ?? 1,
              endLine: loc.physicalLocation?.region?.endLine ?? 1,
              snippet: loc.physicalLocation?.region?.snippet?.text ?? "",
            },
            cwe: cwe.length ? cwe : undefined,
            language: this.detectLanguage(uri),
          });
        }
      }
    }
    return findings;
  }

  private detectLanguage(file: string): Language | undefined {
    if (file.endsWith(".ts") || file.endsWith(".tsx")) return "typescript";
    if (file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".mjs")) return "javascript";
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
}
