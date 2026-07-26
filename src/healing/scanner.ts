export interface Finding {
  id: string;
  /** staticAnalysis findings のみ設定（dependency/performance/secrets は id で識別） */
  ruleId?: string;
  title: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  file: string;
  line?: number;
  framework?: string;
}

interface ScanRule {
  id: string;
  title: string;
  pattern: RegExp;
  message: string;
  severity: Finding["severity"];
  language?: string;
}

const STATIC_ANALYSIS_RULES: ScanRule[] = [
  { id: "any-type", title: "any型の使用", pattern: /:\s*any\b|as\s+any\b/g, message: "any型の使用は型安全性を低下させます", severity: "medium" },
  { id: "non-null-assertion", title: "非nullアサーション", pattern: /\w+!\./g, message: "非nullアサーション(!)は実行時エラーの原因になりえます", severity: "medium" },
  { id: "console-log", title: "console.logの残存", pattern: /console\.(log|debug|info)\s*\(/g, message: "本番コードにconsole出力が残っています", severity: "low" },
  { id: "eval-usage", title: "evalの使用", pattern: /\beval\s*\(/g, message: "evalの使用は任意コード実行のリスクがあります", severity: "critical" },
  { id: "innerHTML-xss", title: "innerHTML XSS", pattern: /\.innerHTML\s*=/g, message: "innerHTMLへの代入はXSS脆弱性の原因になります", severity: "high" },
  { id: "unsafe-regex", title: "安全でない正規表現", pattern: /\(\.\*\)\{/g, message: "爆発的なバックトラックを引き起こす可能性のある正規表現", severity: "high" },
  { id: "unhandled-promise", title: "未処理のPromise", pattern: /\.catch\s*\(/g, message: "catch処理のない非同期呼び出し", severity: "medium" },
  { id: "sql-injection", title: "SQLインジェクションリスク", pattern: /execute\s*\(\s*["'`].*\$|query\s*\(\s*["'`].*\+/g, message: "文字列連結によるSQLクエリ構築はインジェクションリスクがあります", severity: "critical" },
  { id: "hardcoded-secret", title: "ハードコードされた認証情報", pattern: /(password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi, message: "ソースコードにハードコードされた認証情報があります", severity: "critical" },
  { id: "unused-import", title: "未使用インポート", pattern: /^import\s+.*\bfrom\b/mg, message: "未使用のインポートが存在する可能性があります", severity: "low" },
  { id: "any-assertion", title: "型アサーションの乱用", pattern: /\bas\s+(any|unknown)\b/g, message: "any/unknown型へのアサーションは型安全性を損ないます", severity: "medium" },
];

const DEPENDENCY_FILES = [
  "package.json", "Cargo.toml", "go.mod", "requirements.txt",
  "pyproject.toml", "Gemfile", "pom.xml", "build.gradle",
  "pubspec.yaml", "composer.json",
];

const MANIFEST_DEP = /"dependencies"\s*:\s*\{([^}]+)\}/s;

const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];

const SECRET_PATTERNS: [string, RegExp][] = [
  ["github-token", /gh[pousr]_[A-Za-z0-9_]{36,}/g],
  ["aws-key", /AKIA[0-9A-Z]{16}/g],
  ["slack-webhook", /hooks\.slack\.com\/services\/[A-Za-z0-9_/]+/g],
  ["private-key", /-----BEGIN\s+(RSA|EC|DSA|OPENSSH)\s+PRIVATE KEY-----/g],
  ["jwt-token", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]+/g],
];

const FRAMEWORK_DETECTORS: [string, string[]][] = [
  ["react", ["import React", "from 'react'", "from \"react\""]],
  ["vue", ["from 'vue'", "createApp(", "defineComponent("]],
  ["angular", ["@angular/core", "@Component"]],
  ["nextjs", ["next/", "from 'next'"]],
  ["express", ["require('express')", "from 'express'"]],
  ["django", ["django", "from django"]],
  ["fastapi", ["from fastapi", "FastAPI("]],
  ["spring-boot", ["@SpringBootApplication", "spring-boot"]],
];

const PERFORMANCE_RULES: [string, RegExp, string][] = [
  ["sync-fs", /readFileSync|writeFileSync|existsSync/g, "同期ファイル操作はイベントループをブロックします"],
  ["nplus1", /\.forEach\(.*\.find\(|for\s*\(.*\)\s*\{[^}]*\.query/g, "N+1クエリの可能性があります"],
  ["large-loop", /Object\.keys\([^)]+\)\.length/g, "大きなオブジェクトへのkeys()呼び出し"],
  ["sync-http", /request\s*\(\s*\{[^}]*sync\s*:\s*true/g, "同期HTTPリクエストはパフォーマンス低下の原因になります"],
];

export function scanFiles(files: { path: string; content: string }[]): {
  staticAnalysis: Finding[];
  dependency: Finding[];
  performance: Finding[];
  secrets: Finding[];
  licenses: string[];
  detectedFrameworks: string[];
} {
  const staticAnalysis: Finding[] = [];
  const dependency: Finding[] = [];
  const performance: Finding[] = [];
  const secrets: Finding[] = [];
  const licenses: string[] = [];
  const frameworkSignals = new Set<string>();

  for (const file of files) {
    const lines = file.content.split("\n");

    for (const rule of STATIC_ANALYSIS_RULES) {
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          staticAnalysis.push({
            id: `${rule.id}/${file.path}`,
            ruleId: rule.id,
            title: rule.title,
            message: rule.message,
            severity: rule.severity,
            file: file.path,
            line: i + 1,
          });
        }
      }
    }

    for (const [name, pattern] of SECRET_PATTERNS) {
      const match = file.content.match(pattern);
      if (match) {
        for (const m of match) {
          secrets.push({
            id: `secret/${name}/${file.path}`,
            title: `${name} トークン検出`,
            message: `ファイルに ${name} 形式のシークレットが含まれています`,
            severity: "critical",
            file: file.path,
          });
        }
      }
    }

    for (const [name, pat, msg] of PERFORMANCE_RULES) {
      const match = file.content.match(pat);
      if (match) {
        performance.push({
          id: `perf/${name}/${file.path}`,
          title: `パフォーマンス: ${name}`,
          message: msg,
          severity: "medium",
          file: file.path,
        });
      }
    }

    if (DEPENDENCY_FILES.some((df) => file.path.endsWith(df))) {
      const m = file.content.match(MANIFEST_DEP);
      if (m) {
        const deps = m[1].match(/"([^"]+)"/g) ?? [];
        const names = deps.map((d) => d.replace(/"/g, ""));
        if (names.length > 0) {
          dependency.push({
            id: `dep/${file.path}`,
            title: `依存関係: ${file.path}`,
            message: `${names.length}個の依存パッケージ: ${names.slice(0, 10).join(", ")}${names.length > 10 ? "..." : ""}`,
            severity: "info",
            file: file.path,
          });
        }
      } else {
        dependency.push({
          id: `dep/${file.path}`,
          title: `依存マニフェスト: ${file.path}`,
          message: "依存マニフェストファイルを検出しました",
          severity: "info",
          file: file.path,
        });
      }
    }

    if (LICENSE_FILES.some((lf) => file.path.includes(lf))) {
      licenses.push(file.path);
    }

    for (const [fw, signals] of FRAMEWORK_DETECTORS) {
      if (signals.some((s) => file.content.includes(s))) {
        frameworkSignals.add(fw);
      }
    }
  }

  return {
    staticAnalysis: staticAnalysis.slice(0, 500),
    dependency: dependency.slice(0, 200),
    performance: performance.slice(0, 200),
    secrets: secrets.slice(0, 100),
    licenses,
    detectedFrameworks: Array.from(frameworkSignals),
  };
}
