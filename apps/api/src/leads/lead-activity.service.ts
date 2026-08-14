import { Injectable } from '@nestjs/common';
import type { ActivityType, Prisma } from '@prisma/client';
import type { LeadActivity } from '@travel-crm/sdk';

import { PrismaService } from '../shared/prisma.service';
import { userSummarySelect } from '../users/users.service';
import { toLeadActivity } from './leads.mappers';

export interface ActivityInput {
  leadId: string;
  type: ActivityType;
  /** One line, already written for a human to read. */
  summary: string;
  detail?: string | null;
  /** Null for anything the scheduler did rather than a person. */
  actorId?: string | null;
}

/**
 * The lead timeline. Proposals, invoices, payments and the follow-up engine all
 * write here, which is why it is a service of its own rather than a method on
 * LeadsService — nothing downstream should have to depend on lead CRUD just to
 * record that something happened.
 *
 * Append-only by design: there is no update and no delete.
 */
@Injectable()
export class LeadActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an event and stamps the lead's `lastActivityAt`, so "quiet since"
   * on the lead list is always true without anyone remembering to set it.
   *
   * Pass `tx` to join a surrounding transaction — a lead and its "created"
   * entry must appear together or not at all.
   */
  async record(input: ActivityInput, tx?: Prisma.TransactionClient): Promise<LeadActivity> {
    const client = tx ?? this.prisma;
    const createdAt = new Date();

    const [activity] = await Promise.all([
      client.leadActivity.create({
        data: {
          leadId: input.leadId,
          type: input.type,
          summary: input.summary,
          detail: input.detail ?? null,
          actorId: input.actorId ?? null,
          createdAt,
        },
        include: { actor: { select: userSummarySelect } },
      }),
      client.lead.update({ where: { id: input.leadId }, data: { lastActivityAt: createdAt } }),
    ]);

    return toLeadActivity(activity);
  }

  async listFor(leadId: string): Promise<LeadActivity[]> {
    const rows = await this.prisma.leadActivity.findMany({
      where: { leadId },
      include: { actor: { select: userSummarySelect } },
      orderBy: { seq: 'desc' },
    });
    return rows.map(toLeadActivity);
  }
}
