import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@travel-crm/sdk';
import { z } from 'zod';

import { PrismaService } from '../shared/prisma.service';
import { ApiZodResponse } from '../shared/zod';

const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number(),
  services: z.object({
    api: z.enum(['up', 'down']),
    database: z.enum(['up', 'down']),
  }),
});

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and dependency check' })
  @ApiZodResponse(HttpStatus.OK, healthSchema, 'Current service health')
  async check(): Promise<HealthResponse> {
    const databaseUp = await this.prisma.isReachable();

    return {
      status: databaseUp ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      services: {
        api: 'up',
        database: databaseUp ? 'up' : 'down',
      },
    };
  }
}
