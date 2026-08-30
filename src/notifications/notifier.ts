import { AnalysisResult, FindingGroup, CreatedPR } from "../types";

/** Healing 進捗を Workers Logs に出す。メールは AlertService、外部は WebhookManager。 */
export class Notifier {
  async notifyScanComplete(result: AnalysisResult): Promise<void> {
    console.log(
      `[healing] scan complete score=${result.riskScore} groups=${result.groups.length} ${result.summary}`
    );
  }

  async notifyPRCreated(pr: CreatedPR, group: FindingGroup): Promise<void> {
    console.log(`[healing] PR #${pr.number} ${pr.url} group=${group.id} priority=${group.priority}`);
  }

  async notifyFixFailed(group: FindingGroup, reason: string): Promise<void> {
    console.log(`[healing] fix failed group=${group.id}: ${reason.slice(0, 200)}`);
  }
}
