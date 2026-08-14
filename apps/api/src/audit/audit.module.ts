import { Module } from '@nestjs/common';

import { ExportsController } from '../exports/exports.controller';
import { AuditController } from './audit.controller';

/**
 * Reading the trail, and the CSV exports.
 *
 * Both are administrator-only views over data the rest of the application
 * writes, so neither has a service of its own — they read through Prisma
 * directly rather than adding a layer that would only pass calls along.
 */
@Module({
  controllers: [AuditController, ExportsController],
})
export class AuditModule {}
