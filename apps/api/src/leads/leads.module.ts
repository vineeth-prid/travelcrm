import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { LeadActivityService } from './lead-activity.service';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository, LeadActivityService],
  // The timeline and the repository are exported on their own: proposals,
  // invoices and the follow-up engine append to the timeline and move the
  // lead's stage without needing lead CRUD.
  exports: [LeadsService, LeadActivityService, LeadsRepository],
})
export class LeadsModule {}
