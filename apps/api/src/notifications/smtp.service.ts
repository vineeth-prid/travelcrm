import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmtpSettings } from '@prisma/client';
import type { SmtpRequest, SmtpStatus } from '@travel-crm/sdk';
import { createTransport, type Transporter } from 'nodemailer';

import type { Env } from '../config/env';
import { PrismaService } from '../shared/prisma.service';
import { decryptSecret, encryptSecret } from './secret.cipher';

/** A single settings row, always under this id. */
const SETTINGS_ID = 'default';

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/**
 * SMTP configuration and delivery.
 *
 * The password is encrypted at rest and is never put on a response — not
 * masked, not starred out, simply never read into a DTO. `getStatus()` is the
 * only thing the API returns, and it has no password field to fill in.
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get encryptionKey(): string {
    return this.config.get('JWT_SECRET', { infer: true });
  }

  private settings(): Promise<SmtpSettings | null> {
    return this.prisma.smtpSettings.findUnique({ where: { id: SETTINGS_ID } });
  }

  /** Everything about the configuration except the secret. */
  async getStatus(): Promise<SmtpStatus> {
    const row = await this.settings();

    if (!row) {
      return {
        configured: false,
        host: null,
        port: null,
        username: null,
        security: null,
        fromEmail: null,
        fromName: null,
        active: false,
        passwordReadable: false,
      };
    }

    return {
      configured: true,
      host: row.host,
      port: row.port,
      username: row.username,
      security: row.security,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      active: row.active,
      // False after JWT_SECRET has been rotated: the settings survive but the
      // password cannot be read, and it has to be entered again.
      passwordReadable: decryptSecret(row.password, this.encryptionKey) !== null,
    };
  }

  /**
   * Saves the configuration. An omitted password keeps the stored one, so an
   * administrator can change the port without retyping the secret.
   */
  async save(input: SmtpRequest): Promise<SmtpStatus> {
    const existing = await this.settings();

    if (!input.password && !existing) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { password: ['Enter the SMTP password'] },
      });
    }

    const password = input.password
      ? encryptSecret(input.password, this.encryptionKey)
      : existing!.password;

    const data = {
      host: input.host,
      port: input.port,
      username: input.username,
      password,
      security: input.security,
      fromEmail: input.fromEmail,
      fromName: input.fromName,
      active: input.active ?? true,
    };

    await this.prisma.smtpSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    // A changed host or credential invalidates the pooled connection.
    this.transporter = null;
    return this.getStatus();
  }

  /**
   * Cached because nodemailer pools connections, and rebuilding it per message
   * would open a new TCP+TLS session for every notification.
   */
  private transporter: Transporter | null = null;

  private async connect(): Promise<{ transporter: Transporter; from: string } | null> {
    const row = await this.settings();
    if (!row || !row.active) return null;

    const password = decryptSecret(row.password, this.encryptionKey);
    if (password === null) {
      this.logger.error(
        'The stored SMTP password could not be decrypted. If JWT_SECRET was rotated, re-enter it in Settings.',
      );
      return null;
    }

    this.transporter ??= createTransport({
      host: row.host,
      port: row.port,
      // Implicit TLS from the first byte, as on port 465. STARTTLS upgrades an
      // initially plain connection instead, which is `secure: false` here.
      secure: row.security === 'SSL',
      requireTLS: row.security === 'STARTTLS',
      auth: { user: row.username, pass: password },
    });

    return { transporter: this.transporter, from: `"${row.fromName}" <${row.fromEmail}>` };
  }

  get isConfigured(): Promise<boolean> {
    return this.settings().then((row) => row !== null && row.active);
  }

  /**
   * Sends one message. Throws on failure so the caller can record why — the
   * notification row keeps the reason for an administrator to read.
   */
  async send(email: OutgoingEmail): Promise<void> {
    const connection = await this.connect();
    if (!connection) {
      throw new Error('SMTP is not configured');
    }

    await connection.transporter.sendMail({
      from: connection.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
    });
  }

  /** Proves the settings work, without waiting for something to go wrong. */
  async sendTest(to: string): Promise<void> {
    const { smtpTest } = await import('./templates');
    const rendered = smtpTest(this.config.get('COMPANY_NAME', { infer: true }));
    await this.send({ to, subject: rendered.subject, html: rendered.body });
  }
}
