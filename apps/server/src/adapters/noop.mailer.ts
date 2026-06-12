import type { Mailer, MailMessage } from "@ouroboros/core";

/** Mailer used when no email transport is configured. Logs and drops. */
export class NoopMailer implements Mailer {
  readonly kind = "noop" as const;
  async send(msg: MailMessage): Promise<void> {
    console.log(`[NoopMailer] would email ${msg.to.join(", ")}: ${msg.subject}`);
  }
}
