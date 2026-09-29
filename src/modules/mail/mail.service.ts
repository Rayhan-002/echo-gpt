import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfig } from '../../config/configuration';

interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends transactional emails over SMTP. Without SMTP configuration (local dev)
 * messages are written to the log so flows like email verification stay testable.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly appUrl: string;
  private readonly apiPrefix: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const mail = config.get('mail', { infer: true });
    this.from = mail.from;
    this.appUrl = config.get('app.url', { infer: true });
    this.apiPrefix = config.get('app.apiPrefix', { infer: true });
    this.transporter = mail.host
      ? createTransport({
          host: mail.host,
          port: mail.port,
          secure: mail.secure,
          auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
        })
      : null;
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/${this.apiPrefix}/v1/auth/verify-email?token=${token}`;
    await this.send({
      to,
      subject: 'Verify your EchoGPT email address',
      text: `Welcome to EchoGPT! Verify your email address by opening: ${link}\n\nVerification token: ${token}`,
      html: `<p>Welcome to EchoGPT!</p><p><a href="${link}">Verify your email address</a></p><p>Verification token: <code>${token}</code></p>`,
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your EchoGPT password',
      text: `Use this token to reset your password: ${token}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this token to reset your password:</p><p><code>${token}</code></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  private async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[mail disabled] To: ${message.to} | ${message.subject}\n${message.text}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Email delivery must never break the calling flow (e.g. registration).
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}`, error);
    }
  }
}
