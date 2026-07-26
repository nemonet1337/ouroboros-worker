export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Outbound email for alert/warning notifications.
 * Implementations: CfEmailMailer (Workers Email Routing), NoopMailer.
 */
export type MailerKind = "smtp" | "mailchannels" | "sendgrid" | "cf-email" | "noop";

export interface Mailer {
  readonly kind: MailerKind;
  send(msg: MailMessage): Promise<void>;
}
