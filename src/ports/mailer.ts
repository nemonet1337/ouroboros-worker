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
export type MailerKind = "smtp" | "mailchannels" | "sendgrid" | "cf-email" | "noop";

export interface Mailer {
  readonly kind: MailerKind;
  send(msg: MailMessage): Promise<void>;
}
