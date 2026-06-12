import { execSync } from "node:child_process";

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

export class Rollback {
  rollbackLocalChanges(files: string[]): void {
    for (const file of files) {
      try {
        execSync(`git restore "${file}"`, { stdio: "ignore", cwd: REPO_ROOT });
      } catch {
        // File may be new (untracked), try to remove it
        try {
          execSync(`git rm -f "${file}"`, { stdio: "ignore", cwd: REPO_ROOT });
        } catch {
          // ignore
        }
      }
    }
  }

  hardReset(): void {
    try {
      execSync("git reset --hard HEAD && git clean -fd", { stdio: "inherit", cwd: REPO_ROOT, shell: "/bin/sh" });
    } catch (err) {
      console.error("[Rollback] hardReset failed:", err);
    }
  }

  abandonBranch(branchName: string, baseBranch: string): void {
    try {
      execSync(`git checkout "${baseBranch}"`, { stdio: "ignore", cwd: REPO_ROOT });
      execSync(`git branch -D "${branchName}"`, { stdio: "ignore", cwd: REPO_ROOT });
    } catch {
      // ignore
    }
  }
}
