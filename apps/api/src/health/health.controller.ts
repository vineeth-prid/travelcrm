import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@travel-crm/sdk';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InstagramService, type InstagramHealth } from '../integrations/instagram.service';
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

const instagramHealthSchema = z.object({
  healthy: z.boolean(),
  subscribedFields: z.array(z.string()),
  detail: z.string(),
});

@ApiTags('health')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instagram: InstagramService,
  ) {}

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

  /**
   * Asks Instagram whether our app is still subscribed to the `messages` field.
   * A dropped subscription stops every inbound DM while looking, from inside
   * the CRM, exactly like a quiet day. Signed in only: the answer names our
   * subscription state and is nobody else's business.
   */
  @Get('instagram')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Instagram messaging subscription status' })
  @ApiZodResponse(HttpStatus.OK, instagramHealthSchema, 'Instagram subscription health')
  instagramHealth(): Promise<InstagramHealth> {
    return this.instagram.checkHealth();
  }
}
