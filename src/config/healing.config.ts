import { Language, Ecosystem, Framework } from "../types";
import { DEFAULT_WORKERS_AI_MODEL } from "./deployment";

export interface LanguageTarget {
  enabled: boolean;
  projectDir?: string;
  packageManagers?: Ecosystem[];
  frameworks?: Framework[];
  skipPaths?: string[];
}

export interface HealingConfig {
  ai: { model: string; maxRetries: number; contextLines: number };
  targets: Record<Language, LanguageTarget>;
  vcs: { owner: string; repo: string; baseBranch: string; branchPrefix: string };
  notifications: { slackWebhook?: string; teamsWebhook?: string };
  autoMerge: { enabled: boolean; requireCIPass: boolean };
  dryRun: boolean;
  scan: { maxPRsPerRun: number; secretScanEnabled: boolean; licenseCheckEnabled: boolean };
}

const env = process.env;

export const defaultHealingConfig: HealingConfig = {
  ai: {
    model: DEFAULT_WORKERS_AI_MODEL,
    maxRetries: 3,
    contextLines: 20,
  },
  targets: {
    typescript: {
      enabled: true,
      projectDir: env.TS_PROJECT_DIR,
      packageManagers: ["npm", "yarn", "pnpm"],
    },
    javascript: {
      enabled: true,
      projectDir: env.JS_PROJECT_DIR,
      packageManagers: ["npm", "yarn", "pnpm"],
    },
    rust: {
      enabled: true,
      projectDir: env.RUST_PROJECT_DIR,
      packageManagers: ["cargo"],
    },
    flutter: {
      enabled: true,
      projectDir: env.FLUTTER_PROJECT_DIR,
      packageManagers: ["pub"],
    },
    go: {
      enabled: true,
      projectDir: env.GO_PROJECT_DIR,
      packageManagers: ["gomod"],
    },
    java: {
      enabled: true,
      projectDir: env.JAVA_PROJECT_DIR,
      packageManagers: ["maven", "gradle"],
    },
    python: {
      enabled: true,
      projectDir: env.PYTHON_PROJECT_DIR,
      packageManagers: ["pip", "poetry", "conda"],
    },
    ruby: {
      enabled: true,
      projectDir: env.RUBY_PROJECT_DIR,
      packageManagers: ["gem", "bundler"],
    },
    csharp: {
      enabled: true,
      projectDir: env.CSHARP_PROJECT_DIR,
      packageManagers: ["nuget"],
    },
    cpp: {
      enabled: true,
      projectDir: env.CPP_PROJECT_DIR,
      packageManagers: ["vcpkg", "conan"],
    },
  },
  vcs: {
    // GITHUB_TOKEN から自動検出。手動指定する場合のみ env を参照（非推奨）
    owner: env.GITHUB_REPOSITORY_OWNER ?? "",
    repo: (env.GITHUB_REPOSITORY ?? "").split("/")[1] ?? "",
    baseBranch: "main",
    branchPrefix: "heal/",
  },
  notifications: {
    slackWebhook: env.SLACK_WEBHOOK_URL,
    teamsWebhook: env.TEAMS_WEBHOOK_URL,
  },
  autoMerge: {
    enabled: false,
    requireCIPass: true,
  },
  dryRun: env.SELF_HEALING_DRY_RUN === "true",
  scan: {
    maxPRsPerRun: Number(env.SELF_HEALING_MAX_PRS ?? "5"),
    secretScanEnabled: env.SELF_HEALING_SECRET_SCAN === "true",
    licenseCheckEnabled: env.SELF_HEALING_LICENSE_CHECK === "true",
  },
};
