import { Module } from '@nestjs/common';

import { DocumentsModule } from '../documents/documents.module';
import { LeadsModule } from '../leads/leads.module';
import { StorageModule } from '../storage/storage.module';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [LeadsModule, StorageModule, DocumentsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
