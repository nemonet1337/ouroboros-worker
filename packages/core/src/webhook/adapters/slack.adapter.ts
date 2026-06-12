import { WebhookPayload } from "../../types/inspection.types";

// Slack sidebar colors keyed by grade
const GRADE_COLOR: Record<string, string> = {
  S: "#2EB67D",
  A: "#2EB67D",
  B: "#36C5F0",
  C: "#ECB22E",
  D: "#E01E5A",
  F: "#E01E5A",
};

const EVENT_TITLE: Record<string, string> = {
  "inspection.completed": "ouroboros インスペクション完了",
  "inspection.threshold_breached": "ouroboros スコア閾値超過",
  "inspection.failed": "ouroboros インスペクション失敗",
};

const EVENT_EMOJI: Record<string, string> = {
  "inspection.completed": "✅",
  "inspection.threshold_breached": "⚠️",
  "inspection.failed": "❌",
};

/**
 * Format a WebhookPayload as a Slack Block Kit message.
 * Uses attachments (not top-level blocks) so the sidebar color is visible.
 */
export function toSlackPayload(payload: WebhookPayload): Record<string, unknown> {
  const { inspection, event, breaches } = payload;
  const { overall, grade } = inspection.scoreCard;
  const color = GRADE_COLOR[grade] ?? "#E01E5A";
  const emoji = EVENT_EMOJI[event] ?? "ℹ️";
  const title = EVENT_TITLE[event] ?? "ouroboros 通知";

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} ${title}`, emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*総合スコア*\n${overall}/100 (グレード: ${grade})` },
        { type: "mrkdwn", text: `*言語*\n${inspection.language}` },
        { type: "mrkdwn", text: `*指摘件数*\n${inspection.findingCount}件` },
        { type: "mrkdwn", text: `*改善案*\n${inspection.recommendationCount}件` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: inspection.summary },
    },
  ];

  if (breaches && breaches.length > 0) {
    const breachLines = breaches
      .map((b) => `• *${b.category}*: 閾値 ${b.threshold}点 → 実測値 ${b.actual}点`)
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*閾値超過の内訳*\n${breachLines}` },
    });
  }

  if (inspection.url) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "詳細レポートを見る", emoji: true },
          url: inspection.url,
          action_id: "view_report",
        },
      ],
    });
  }

  return {
    attachments: [
      {
        color,
        blocks,
        fallback: `${emoji} ${title} — スコア ${overall}/100 (${grade})`,
      },
    ],
  };
}
