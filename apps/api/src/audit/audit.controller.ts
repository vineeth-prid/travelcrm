import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuditEntry } from '@travel-crm/sdk';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../shared/prisma.service';
import { ApiZodResponse, ZodValidationPipe } from '../shared/zod';

const auditQuerySchema = z.object({
  entity: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  actorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const auditListSchema = z.array(
  z.object({
    id: z.string().uuid(),
    entity: z.string(),
    entityId: z.string().nullable(),
    action: z.string(),
    summary: z.string(),
    actorName: z.string(),
    actorRole: z.string(),
    ip: z.string().nullable(),
    status: z.number().int(),
    createdAt: z.string().datetime(),
  }),
);

/**
 * Reading the audit trail. Administrators only, and read-only — there is no
 * write, update or delete endpoint here, and none anywhere else either (§31).
 */
@ApiTags('audit')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'The audit trail, newest first' })
  @ApiZodResponse(HttpStatus.OK, auditListSchema, 'Audit entries')
  async list(
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(query.entity ? { entity: query.entity } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
      },
      // By sequence, not timestamp: entries can share a millisecond.
      orderBy: { seq: 'desc' },
      take: query.limit ?? 200,
    });

    return rows.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      summary: row.summary,
      actorName: row.actorName,
      actorRole: row.actorRole,
      ip: row.ip,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
