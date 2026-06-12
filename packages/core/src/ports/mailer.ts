export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound email for alert/warning notifications.
 * Implementations:
 * MailChannelsMailer (fetch, Cloudflare — MailChannels or SendGrid).
 */
export interface Mailer {
  readonly kind: "smtp" | "mailchannels" | "sendgrid" | "noop";
  send(msg: MailMessage): Promise<void>;
}
