import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Cross-cutting providers available to every feature module. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class SharedModule {}
