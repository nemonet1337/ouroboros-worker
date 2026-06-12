import { HealingConfig } from "../config/healing.config";
import { AnalysisResult, FindingGroup, CreatedPR } from "../types";

export class Notifier {
  constructor(private readonly config: HealingConfig) {}

  async notifyScanComplete(result: AnalysisResult): Promise<void> {
    const hasCritical = result.groups.some((g) => g.priority === "critical");
    const hasHigh = result.groups.some((g) => g.priority === "high");
    const emoji = hasCritical ? "🚨" : hasHigh ? "⚠️" : "✅";

    const criticalCount = result.groups.filter((g) => g.priority === "critical").length;
    const highCount = result.groups.filter((g) => g.priority === "high").length;

    const text = [
      `${emoji} Self-Healing スキャン完了`,
      `リスクスコア: ${result.riskScore}/100`,
      `${result.summary}`,
      `グループ数: ${result.groups.length} 件 (Critical: ${criticalCount}, High: ${highCount})`,
    ].join("\n");

    await this.send(text);
  }

  async notifyPRCreated(pr: CreatedPR, group: FindingGroup): Promise<void> {
    const text = [
      `🔧 Self-Healing PR 作成`,
      `PR #${pr.number}: ${pr.title}`,
      `Priority: ${group.priority}`,
      `URL: ${pr.url}`,
    ].join("\n");
    await this.send(text);
  }

  async notifyMerged(prNumber: number, merged: boolean): Promise<void> {
    const text = merged
      ? `✅ Self-Healing PR #${prNumber} がマージされました`
      : `ℹ️ Self-Healing PR #${prNumber} は自動マージの条件を満たしていません`;
    await this.send(text);
  }

  async notifyFixFailed(group: FindingGroup, reason: string): Promise<void> {
    const text = [
      `❌ Self-Healing 自動修正失敗`,
      `グループ: ${group.id} (${group.priority})`,
      `理由: ${reason.slice(0, 200)}`,
    ].join("\n");
    await this.send(text);
  }

  private async send(text: string): Promise<void> {
    await Promise.allSettled([this.sendSlack(text), this.sendTeams(text)]);
  }

  private async sendSlack(text: string): Promise<void> {
    if (!this.config.notifications.slackWebhook) return;
    try {
      await fetch(this.config.notifications.slackWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error("[Notifier] Slack send failed:", err);
    }
  }

  private async sendTeams(text: string): Promise<void> {
    if (!this.config.notifications.teamsWebhook) return;
    try {
      await fetch(this.config.notifications.teamsWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error("[Notifier] Teams send failed:", err);
    }
  }
}
