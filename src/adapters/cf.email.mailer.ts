import type { Mailer, MailMessage } from "../ports";
import type { SendEmailBinding } from "../env";

export class CfEmailMailer implements Mailer {
  readonly kind = "cf-email" as const;

  constructor(
    private readonly emailBinding: SendEmailBinding,
    private readonly from: string
  ) {}

  async send(msg: MailMessage): Promise<void> {
    for (const to of msg.to) {
      await this.emailBinding.send({
        from: this.from,
        to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
      });
    }
  }
}