import { Module } from '@nestjs/common';

import { NotificationService } from './notification.service';
import { SmtpController } from './smtp.controller';
import { SmtpService } from './smtp.service';

/**
 * Delivery, kept away from business logic.
 *
 *     something happens → NotificationService → SmtpService → SMTP
 *
 * Only NotificationService is exported: nothing outside this module should be
 * reaching for a mail transport directly.
 */
@Module({
  controllers: [SmtpController],
  providers: [NotificationService, SmtpService],
  exports: [NotificationService, SmtpService],
})
export class NotificationsModule {}
