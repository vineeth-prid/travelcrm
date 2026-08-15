import { Module } from '@nestjs/common';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  // The PDF services read the company details and the templates from here.
  exports: [DocumentsService],
})
export class DocumentsModule {}
