import { WebhookPayload } from "../../types/inspection.types";

// Discord embed sidebar colors (decimal RGB) keyed by grade
const GRADE_COLOR: Record<string, number> = {
  S: 0x2eb67d,
  A: 0x2eb67d,
  B: 0x36c5f0,
  C: 0xecb22e,
  D: 0xe01e5a,
  F: 0xe01e5a,
};

const EVENT_TITLE: Record<string, string> = {
  "inspection.completed": "✅ ouroboros インスペクション完了",
  "inspection.threshold_breached": "⚠️ ouroboros スコア閾値超過",
  "inspection.failed": "❌ ouroboros インスペクション失敗",
};

/**
 * Format a WebhookPayload as a Discord Webhook embed message.
 */
export function toDiscordPayload(payload: WebhookPayload): Record<string, unknown> {
  const { inspection, event, breaches } = payload;
  const { overall, grade } = inspection.scoreCard;
  const color = GRADE_COLOR[grade] ?? 0xe01e5a;
  const title = EVENT_TITLE[event] ?? "ouroboros 通知";

  const fields: Record<string, unknown>[] = [
    { name: "総合スコア", value: `${overall}/100 (${grade})`, inline: true },
    { name: "言語", value: inspection.language, inline: true },
    { name: "指摘件数", value: `${inspection.findingCount}件`, inline: true },
    { name: "改善案", value: `${inspection.recommendationCount}件`, inline: true },
  ];

  if (breaches && breaches.length > 0) {
    const breachText = breaches
      .map((b) => `**${b.category}**: 閾値 ${b.threshold}点 → 実測値 **${b.actual}点**`)
      .join("\n");
    fields.push({ name: "閾値超過の内訳", value: breachText, inline: false });
  }

  const embed: Record<string, unknown> = {
    title,
    description: inspection.summary,
    color,
    fields,
    timestamp: payload.triggeredAt,
    footer: { text: "ouroboros AI Inspection System" },
  };

  if (inspection.url) {
    embed.url = inspection.url;
  }

  return { embeds: [embed] };
}
