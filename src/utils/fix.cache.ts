import { FindingGroup, CodeQLFinding, DependencyFinding } from "../types";
import { HealingConfig } from "../config/healing.config";
import type { VcsProvider } from "../ports/vcs";

/** Deterministic, dependency-free 53-bit string hash (FNV-1a style). */
function stableHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Deduplicates already-applied fixes using closed VCS issues as a 30-day cache.
 * VCS-agnostic via the VcsProvider port.
 */
export class FixCache {
  private cachedHashes = new Set<string>();

  constructor(
    private readonly config: HealingConfig,
    private readonly vcs?: VcsProvider
  ) {}

  async load(): Promise<void> {
    if (!this.vcs) return;
    this.cachedHashes.clear();
    try {
      const issues = await this.vcs.listIssues(["self-healing", "fix-cache"], "closed");
      for (const issue of issues) {
        const match = issue.body.match(/<!-- fix-hash: ([a-f0-9]+) -->/);
        if (match?.[1]) this.cachedHashes.add(match[1]);
      }
    } catch (err) {
      console.warn("[FixCache] failed to load cache:", err instanceof Error ? err.message : err);
    }
  }

  has(group: FindingGroup): boolean {
    return this.cachedHashes.has(this.computeHash(group));
  }

  async record(group: FindingGroup): Promise<void> {
    if (!this.vcs) return;
    const hash = this.computeHash(group);
    try {
      const number = await this.vcs.createIssue({
        title: `[fix-cache] ${group.fixStrategy.title}`,
        body: `Fix cache entry for group \`${group.id}\`.\n\n<!-- fix-hash: ${hash} -->`,
        labels: ["self-healing", "fix-cache"],
      });
      await this.vcs.updateIssue(number, { state: "closed" });
      this.cachedHashes.add(hash);
    } catch (err) {
      console.error("[FixCache] failed to record:", err);
    }
  }

  private computeHash(group: FindingGroup): string {
    const keys = group.findings.map((f) => {
      const dep = f as DependencyFinding;
      const cql = f as CodeQLFinding;
      if (dep.ecosystem && dep.packageName) return `dep:${dep.packageName}:${dep.ecosystem}`;
      if (cql.ruleId && cql.location) return `cql:${cql.ruleId}:${cql.location.file}:${cql.location.startLine}`;
      return JSON.stringify(f).slice(0, 100);
    });
    return stableHash(keys.sort().join("|"));
  }
}
