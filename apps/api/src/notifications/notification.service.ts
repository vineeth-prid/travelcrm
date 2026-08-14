import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type NotificationType } from '@prisma/client';

import type { Env } from '../config/env';
import { PrismaService } from '../shared/prisma.service';
import { SmtpService } from './smtp.service';
import type { RenderedEmail } from './templates';

export interface NotificationRequest {
  type: NotificationType;
  recipient: { id: string | null; email: string; name: string };
  /**
   * Stable and derived from what the message is *about*, never from the time.
   * "This missed follow-up" has one key forever, so a second attempt to send
   * it is refused by the database.
   */
  dedupeKey: string;
  email: RenderedEmail;
}

/**
 * The one way the application sends anything.
 *
 *     Follow-up engine → NotificationService → SmtpService → SMTP
 *
 * Business logic never touches a mail transport. Adding SES, WhatsApp or an
 * in-app inbox later means adding a provider here, not editing the follow-up
 * engine — which is the whole point of the separation.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly smtp: SmtpService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The base the links in emails point at. */
  get appUrl(): string {
    return this.config.get('APP_URL', { infer: true }).replace(/\/$/, '');
  }

  /** The name every template puts at the top. */
  get companyName(): string {
    return this.config.get('COMPANY_NAME', { infer: true });
  }

  /**
   * Records the notification, then tries to deliver it.
   *
   * Recording first is deliberate: the unique `dedupeKey` is what enforces
   * "one notification per missed follow-up", and it can only do that if the
   * row is written before anything is sent. A duplicate is dropped silently —
   * it means the work was already done, which is not an error.
   *
   * Returns true when a message was actually sent.
   */
  async send(request: NotificationRequest): Promise<boolean> {
    let notificationId: string;

    try {
      const created = await this.prisma.notification.create({
        data: {
          type: request.type,
          dedupeKey: request.dedupeKey,
          recipientId: request.recipient.id,
          recipientEmail: request.recipient.email,
          subject: request.email.subject,
          body: request.email.body,
        },
      });
      notificationId = created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Notification ${request.dedupeKey} was already raised; skipping.`);
        return false;
      }
      throw error;
    }

    // Delivery failing must not roll back the record: the row is the evidence
    // that the situation was noticed, and an administrator can see why it did
    // not go out.
    try {
      await this.smtp.send({
        to: request.recipient.email,
        subject: request.email.subject,
        html: request.email.body,
      });

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'SENT', sentAt: new Date() },
      });

      return true;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.warn(`Could not send ${request.type} to ${request.recipient.email}: ${detail}`);

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED', error: detail.slice(0, 500) },
      });

      return false;
    }
  }

  /** Administrators, for escalations. */
  async admins(): Promise<{ id: string; email: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { id: true, email: true, name: true },
    });
  }
}

/**
 * Builds a dedupe key from the things that identify an event.
 *
 * Never include a timestamp: that is exactly what would make every scheduler
 * pass look like a new event and send the same email over and over.
 */
export function dedupeKeyFor(type: NotificationType, ...parts: string[]): string {
  return [type, ...parts].join(':');
}
