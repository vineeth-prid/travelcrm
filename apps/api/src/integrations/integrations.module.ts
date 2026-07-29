import { Module } from '@nestjs/common';

import { InstagramService } from './instagram.service';
import { MetaGraphClient } from './meta-graph.client';
import { WhatsAppService } from './whatsapp.service';

/** Everything that talks to Meta. Nothing here touches the database. */
@Module({
  providers: [MetaGraphClient, InstagramService, WhatsAppService],
  exports: [InstagramService, WhatsAppService],
})
export class IntegrationsModule {}
