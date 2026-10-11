import type { FindingGroup, Patch } from "../types";
import { HealingConfig } from "../config/healing.config";
import type { VcsProvider } from "./vcs";

export function buildPRTitle(group: FindingGroup): string {
  return `fix(self-healing): ${group.fixStrategy.title}`;
}

export function buildPRBody(patches: Patch[], group: FindingGroup, iterations: number): string {
  const findingsSample = group.findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. \`${JSON.stringify(f).slice(0, 200)}\``)
    .join("\n");

  const patchList = patches.map((p) => `- **${p.file}**: ${p.explanation}`).join("\n");

  return `## 🩹 Self-Healing 自動修正レポート

### 修正戦略
**${group.fixStrategy.title}**

**修正手順:**
${group.fixStrategy.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**根拠:** ${group.fixStrategy.rationale}

---

### 修正されたファイル
${patchList || "なし"}

---

### 検出された問題（先頭5件）
${findingsSample}

---

### メタ情報
- Priority: \`${group.priority}\`
- Estimated Risk: ${group.estimatedRisk}
- Iterations: ${iterations}

> ⚠️ このPRは自動生成されました。マージ前に必ず内容を確認してください。`;
}

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
