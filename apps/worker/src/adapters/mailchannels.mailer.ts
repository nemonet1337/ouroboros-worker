import type { Mailer, MailMessage } from "@ouroboros/core";

/**
 * Mailer using MailChannels' HTTP send API — the standard way to send email
 * from Cloudflare Workers without SMTP.
 */
export class MailChannelsMailer implements Mailer {
  readonly kind = "mailchannels" as const;

  constructor(private readonly from: string) {}

  async send(msg: MailMessage): Promise<void> {
    const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: msg.to.map((email) => ({ email })) }],
        from: { email: this.from, name: "Ouroboros" },
        subject: msg.subject,
        content: [
          { type: "text/plain", value: msg.text },
          ...(msg.html ? [{ type: "text/html", value: msg.html }] : []),
        ],
      }),
    });
    if (!res.ok && res.status !== 202) {
      throw new Error(`MailChannels error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}
