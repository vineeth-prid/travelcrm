import { Module } from '@nestjs/common';

import { CommunicationModule } from '../communication/communication.module';
import { StorageModule } from '../storage/storage.module';
import { QuotePdfService } from './quote-pdf.service';
import { QuotesController } from './quotes.controller';
import { QuotesRepository } from './quotes.repository';
import { QuotesService } from './quotes.service';

@Module({
  imports: [CommunicationModule, StorageModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuotesRepository, QuotePdfService],
})
export class QuotesModule {}
