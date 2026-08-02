import { Module } from '@nestjs/common';

import { InstagramService } from './instagram.service';
import { MetaGraphClient } from './meta-graph.client';
import { WhatsAppService } from './whatsapp.service';

/**
 * Everything that talks to Meta. The one database touch is the Instagram
 * access token, which the service refreshes and stores by itself.
 */
@Module({
  providers: [MetaGraphClient, InstagramService, WhatsAppService],
  exports: [InstagramService, WhatsAppService],
})
export class IntegrationsModule {}
