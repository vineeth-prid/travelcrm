import { Module } from '@nestjs/common';

import { CommunicationModule } from '../communication/communication.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OpenAiClient } from './openai.client';

@Module({
  imports: [CommunicationModule],
  controllers: [AiController],
  providers: [AiService, OpenAiClient],
})
export class AiModule {}
