import { FindingGroup } from "../types";
import { HealingConfig } from "../config/healing.config";
import type { VcsProvider } from "../ports/vcs";

/**
 * Tracks open self-healing PR branches to avoid opening duplicates.
 * VCS-agnostic: branch discovery goes through the VcsProvider port.
 */
export class PRDeduplicator {
  private openBranches = new Set<string>();

  constructor(
    private readonly config: HealingConfig,
    private readonly vcs?: VcsProvider
  ) {}

  async loadOpenPRs(): Promise<void> {
    if (!this.vcs) return;
    this.openBranches.clear();
    const prs = await this.vcs.listOpenPRs(this.config.vcs.branchPrefix);
    for (const pr of prs) this.openBranches.add(pr.branch);
  }

  isDuplicate(group: FindingGroup): boolean {
    const slug = this.toSlug(group);
    for (const branch of this.openBranches) {
      if (branch.includes(slug)) return true;
    }
    return false;
  }

  register(branch: string): void {
    this.openBranches.add(branch);
  }

  toSlug(group: FindingGroup): string {
    return group.id
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  }
}
