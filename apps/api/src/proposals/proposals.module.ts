import { Module } from '@nestjs/common';

import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { DocumentsModule } from '../documents/documents.module';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { ProposalPdfService } from './proposal-pdf.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsRepository } from './proposals.repository';
import { ProposalsService } from './proposals.service';

@Module({
  imports: [LeadsModule, StorageModule, FollowUpsModule, DocumentsModule, NotificationsModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, ProposalsRepository, ProposalPdfService],
  exports: [ProposalsService],
})
export class ProposalsModule {}
