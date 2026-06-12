import nodemailer, { type Transporter } from "nodemailer";
import type { Mailer, MailMessage } from "@ouroboros/core";

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  secure?: boolean;
}

/** SMTP mailer (nodemailer) for the self-hosted deployment. */
export class SmtpMailer implements Mailer {
  readonly kind = "smtp" as const;
  private readonly transport: Transporter;

  constructor(private readonly cfg: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure ?? cfg.port === 465,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.cfg.from,
      to: msg.to.join(", "),
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
  }
}
