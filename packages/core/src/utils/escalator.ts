import { FindingGroup } from "../types";
import { HealingConfig } from "../config/healing.config";
import type { VcsProvider } from "../ports/vcs";

/**
 * Files a manual-fix issue when a finding group is not auto-fixable or fixing
 * fails. VCS-agnostic via the VcsProvider port.
 */
export class Escalator {
  constructor(
    private readonly config: HealingConfig,
    private readonly vcs?: VcsProvider,
    private readonly assignees: string[] = [],
    private readonly commitHash = "local"
  ) {}

  async escalate(group: FindingGroup, failReason?: string): Promise<void> {
    if (!this.vcs) return;
    const title = `🚨 [self-healing] Manual fix required: ${group.fixStrategy.title}`;

    try {
      const existing = await this.vcs.listIssues(["self-healing", "escalation"], "open");
      if (existing.some((i) => i.title === title)) return;
    } catch {
      // proceed if we can't check
    }

    const findingsSample = group.findings
      .slice(0, 3)
      .map((f) => `\`\`\`json\n${JSON.stringify(f, null, 2)}\n\`\`\``)
      .join("\n\n");

    const failSection = failReason
      ? `\n### 自動修正の失敗理由\n\`\`\`\n${failReason.slice(0, 2000)}\n\`\`\`\n`
      : "";

    const body = `## 🚨 Self-Healing エスカレーション

| 項目 | 値 |
|------|-----|
| Priority | \`${group.priority}\` |
| Risk | ${group.estimatedRisk} |
| Language | \`${group.language ?? "不明"}\` |
| Framework | \`${group.framework ?? "不明"}\` |

### 修正方針

**${group.fixStrategy.title}**

**手順:**
${group.fixStrategy.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**根拠:** ${group.fixStrategy.rationale}
${failSection}
### 検出された問題（先頭3件）

${findingsSample}

---

**Commit:** \`${this.commitHash}\`

> このIssueはSelf-Healing CI/CDによって自動作成されました。手動での対応が必要です。`;

    try {
      await this.vcs.createIssue({
        title,
        body,
        labels: ["self-healing", "escalation", group.priority],
        assignees: this.assignees,
      });
    } catch (err) {
      console.error("[Escalator] failed to create issue:", err);
    }
  }
}
