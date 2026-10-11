import { vi } from "vitest";
import type { AiProvider, AiCompletionRequest } from "../ai/types";
import type {
  CodeCommitResult,
  CodeGenerateOptions,
  CodeGenerateResult,
  CodeInitOptions,
  CodeInitResult,
  CodeReadResult,
  CodeRunner,
  CodeSearchResult,
  CodeWriteResult,
  HealingRunner,
  RunFixOptions,
  RunnerFixResult,
  RunnerScanResult,
} from "../core/runner";
import type { AllFindings } from "../types";
import type { DbAdapter } from "../db/adapter";
import type { VcsProvider } from "../core/vcs";
import type { Ports } from "../context";
import type { HealingConfig } from "../config/healing.config";
import { MemoryRateLimiter } from "../core/ratelimit";

/** Deterministic AI provider stub for tests. */
export function mockAi(response = ""): AiProvider {
  return {
    name: "mock",
    async complete(_req: AiCompletionRequest): Promise<string> {
      return response;
    },
  };
}

/** DbAdapter stub for tests. */
export function mockDb(): DbAdapter {
  return {
    dialect: "sqlite",
    exec: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    batch: vi.fn(),
  };
}

/** VcsProvider stub for tests. */
export function mockVcs(): VcsProvider {
  return {
    name: "github",
    createPR: vi.fn(),
    listOpenPRs: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn(),
    listIssues: vi.fn().mockResolvedValue([]),
    updateIssue: vi.fn(),
    listRepos: vi.fn().mockResolvedValue([]),
  };
}

/** テスト共通の Ports 一式（db / vcs / emit / runner / rateLimiter）。 */
export function mockPorts(db: DbAdapter = mockDb()): Ports {
  return {
    db,
    ai: mockAi(""),
    vcs: mockVcs(),
    emit: vi.fn(),
    runner: new NoopRunner(),
    rateLimiter: new MemoryRateLimiter(),
  };
}

/** テスト共通の HealingConfig。 */
export function mockConfig(): HealingConfig {
  return {
    ai: { model: "minimax/m3", maxRetries: 3, contextLines: 20 },
    vcs: { owner: "test", repo: "test", baseBranch: "main", branchPrefix: "ouro-fix" },
    dryRun: false,
    scan: { maxPRsPerRun: 5 },
  };
}

/**
 * テスト用の空ランナー。本番の context では RepoRunner を使う。
 */
export class NoopRunner implements HealingRunner, CodeRunner {
  async scan(): Promise<RunnerScanResult> {
    return {
      findings: {
        staticAnalysis: [],
        dependency: [],
        performance: [],
        secrets: [],
        licenses: [],
        detectedFrameworks: [],
        timestamp: new Date(),
        commitHash: "",
      } satisfies AllFindings,
    };
  }

  async applyFix(_opts: RunFixOptions): Promise<RunnerFixResult> {
    return {
      success: false,
      patches: [],
      validationOutput: "no runner configured",
      iterations: 0,
    };
  }

  async init(_opts: CodeInitOptions): Promise<CodeInitResult> {
    return { success: false, repoPath: "", fileList: [] };
  }

  async read(_opts: { sessionId: string; paths: string[] }): Promise<CodeReadResult> {
    return { files: [] };
  }

  async search(_opts: { sessionId: string; query: string; type: "grep" | "glob" }): Promise<CodeSearchResult> {
    return { results: [] };
  }

  async write(_opts: { sessionId: string; files: { path: string; content: string }[] }): Promise<CodeWriteResult> {
    return { success: false, files: [] };
  }

  async commit(_opts: { sessionId: string; message: string }): Promise<CodeCommitResult> {
    return { success: false, commitHash: "" };
  }

  async push(_opts: { sessionId: string; branch: string }): Promise<{ success: boolean }> {
    return { success: false };
  }

  async generate(_opts: CodeGenerateOptions): Promise<CodeGenerateResult> {
    return { patches: [], model: "", error: "no runner configured" };
  }
}
