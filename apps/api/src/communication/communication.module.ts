import { Module } from '@nestjs/common';

import { IntegrationsModule } from '../integrations/integrations.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';
import { InboxEventsService } from './inbox-events.service';
import { MessageIngestService } from './message-ingest.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [ConversationsController],
  providers: [
    ConversationsRepository,
    ConversationsService,
    MessageIngestService,
    InboxEventsService,
  ],
  exports: [MessageIngestService, ConversationsService],
})
export class CommunicationModule {}
