import type { Mailer, MailMessage } from "../ports/mailer";

/**
 * EMAIL バインディング未設定時のフォールバック。
 * MailChannels 無償 API は終了済みのため送信せずログのみ。
 */
export class NoopMailer implements Mailer {
  readonly kind = "noop" as const;

  async send(msg: MailMessage): Promise<void> {
    console.warn(
      `[mailer] EMAIL binding not configured; skipped send to ${msg.to.join(", ")}: ${msg.subject}`
    );
  }
}
