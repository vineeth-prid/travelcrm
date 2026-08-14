import { Module } from '@nestjs/common';

import { CommunicationModule } from '../communication/communication.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChatClient } from './chat.client';

@Module({
  imports: [CommunicationModule],
  controllers: [AiController],
  providers: [AiService, ChatClient],
})
export class AiModule {}
