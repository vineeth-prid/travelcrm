import { Module } from '@nestjs/common';

import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowUpScheduler } from './follow-up.scheduler';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [LeadsModule, NotificationsModule],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpScheduler],
  // Proposals schedules follow-ups on submission; the scheduler is exported so
  // a sweep can be triggered on demand and asserted against in tests.
  exports: [FollowUpsService, FollowUpScheduler],
})
export class FollowUpsModule {}
