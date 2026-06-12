export type Language =
  | "typescript"
  | "javascript"
  | "rust"
  | "flutter"
  | "go"
  | "csharp"
  | "cpp"
  | "java"
  | "python"
  | "ruby";

export type Ecosystem =
  | "npm"
  | "yarn"
  | "pnpm"
  | "cargo"
  | "pub"
  | "gomod"
  | "nuget"
  | "vcpkg"
  | "conan"
  | "maven"
  | "gradle"
  | "pip"
  | "poetry"
  | "conda"
  | "gem"
  | "bundler";

export type Framework =
  | "react"
  | "vue"
  | "angular"
  | "nextjs"
  | "nuxtjs"
  | "svelte"
  | "remix"
  | "astro"
  | "express"
  | "nestjs"
  | "fastify"
  | "gin"
  | "echo"
  | "fiber"
  | "chi"
  | "gorilla-mux"
  | "spring-boot"
  | "quarkus"
  | "micronaut"
  | "jakarta-ee"
  | "django"
  | "fastapi"
  | "flask"
  | "tornado"
  | "rails"
  | "sinatra"
  | "hanami"
  | "aspnet-core"
  | "blazor"
  | "maui"
  | "wpf"
  | "qt"
  | "boost"
  | "poco"
  | "wxwidgets";

export type Priority = "critical" | "high" | "medium" | "low" | "info";

export interface CVE {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  cvssScore: number;
  description: string;
  patchedVersion: string;
}

export interface DependencyFinding {
  ecosystem: Ecosystem;
  packageName: string;
  currentVersion: string;
  latestVersion: string;
  updateType: "major" | "minor" | "patch";
  vulnerabilities: CVE[];
  breakingChanges: boolean;
  framework?: Framework;
  manifestFile?: string;
}

export interface CodeQLFinding {
  ruleId: string;
  severity: "error" | "warning" | "note";
  message: string;
  location: { file: string; startLine: number; endLine: number; snippet: string };
  cwe?: string[];
  language?: Language;
}

export interface PerformanceFinding {
  subsystem: string;
  metric: string;
  baseline: number;
  current: number;
  deltaPct: number;
  thresholdPct: number;
}

export interface SecretFinding {
  type: "secret";
  tool: "trufflehog" | "gitleaks";
  detector: string;
  file: string;
  line: number;
  commit?: string;
  description: string;
}

export interface LicenseFinding {
  type: "license";
  file: string;
  packageName: string;
  license: string;
  status: "forbidden" | "unknown" | "allowed";
  description: string;
}

export interface FixStrategy {
  title: string;
  steps: string[];
  rationale: string;
}

export interface FindingGroup {
  id: string;
  priority: Priority;
  findings: Array<CodeQLFinding | DependencyFinding | PerformanceFinding | SecretFinding>;
  autoFixable: boolean;
  estimatedRisk: string;
  fixStrategy: FixStrategy;
  language?: Language;
  framework?: Framework;
}

export interface Patch {
  file: string;
  originalContent: string;
  fixedContent: string;
  diff: string;
  explanation: string;
}

export interface ValidationResult {
  success: boolean;
  output: string;
}

export interface FixResult {
  success: boolean;
  appliedPatches: Patch[];
  failedFindings: FindingGroup[];
  validationOutput: string;
  iterations: number;
}

export interface AllFindings {
  codeql: CodeQLFinding[];
  dependency: DependencyFinding[];
  performance: PerformanceFinding[];
  secrets: SecretFinding[];
  licenses: LicenseFinding[];
  detectedFrameworks: Framework[];
  timestamp: Date;
  commitHash: string;
}

export interface AnalysisResult {
  groups: FindingGroup[];
  summary: string;
  riskScore: number;
  estimatedFixTime: number;
}

export interface CreatedPR {
  number: number;
  url: string;
  branch: string;
  title: string;
}
