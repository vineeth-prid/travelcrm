import { Module } from '@nestjs/common';

import { CommunicationModule } from '../communication/communication.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [CommunicationModule, IntegrationsModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookSignatureGuard],
})
export class WebhooksModule {}
