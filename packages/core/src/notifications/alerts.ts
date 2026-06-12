import type { Mailer } from "../ports/mailer";
import type { AnalysisResult, FindingGroup } from "../types";

/**
 * Email-based warning/alert notifications. Backed by the Mailer port
 * (SMTP self-hosted, MailChannels/SendGrid on Cloudflare).
 */
export class AlertService {
  constructor(
    private readonly mailer: Mailer,
    private readonly recipients: string[]
  ) {}

  private get enabled(): boolean {
    return this.mailer.kind !== "noop" && this.recipients.length > 0;
  }

  async scanRisk(analysis: AnalysisResult): Promise<void> {
    if (!this.enabled) return;
    const critical = analysis.groups.filter((g) => g.priority === "critical").length;
    const high = analysis.groups.filter((g) => g.priority === "high").length;
    if (analysis.riskScore < 60 && critical === 0) return;

    await this.safeSend({
      to: this.recipients,
      subject: `[Ouroboros] ⚠️ High-risk scan: score ${analysis.riskScore}/100`,
      text: [
        `Ouroboros detected an elevated-risk state.`,
        ``,
        `Risk score: ${analysis.riskScore}/100`,
        `Critical groups: ${critical}`,
        `High groups: ${high}`,
        ``,
        analysis.summary,
      ].join("\n"),
    });
  }

  async fixFailed(group: FindingGroup, reason: string): Promise<void> {
    if (!this.enabled) return;
    await this.safeSend({
      to: this.recipients,
      subject: `[Ouroboros] ❌ Auto-fix failed: ${group.fixStrategy.title}`,
      text: [
        `An automated self-healing fix failed and was escalated.`,
        ``,
        `Group: ${group.id} (${group.priority})`,
        `Reason: ${reason.slice(0, 1000)}`,
      ].join("\n"),
    });
  }

  private async safeSend(msg: Parameters<Mailer["send"]>[0]): Promise<void> {
    try {
      await this.mailer.send(msg);
    } catch (err) {
      console.error("[AlertService] email send failed:", err instanceof Error ? err.message : err);
    }
  }
}
