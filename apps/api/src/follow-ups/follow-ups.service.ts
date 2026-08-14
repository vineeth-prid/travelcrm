import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { FollowUpRule, Prisma } from '@prisma/client';
import type {
  FollowUp,
  FollowUpCompleteRequest,
  FollowUpQuery,
  FollowUpRule as FollowUpRuleDto,
  FollowUpRuleRequest,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { LeadActivityService } from '../leads/lead-activity.service';
import { LeadsRepository } from '../leads/leads.repository';
import { PrismaService } from '../shared/prisma.service';
import {
  followUpInclude,
  toFollowUp,
  toFollowUpRule,
  type FollowUpWithRelations,
} from './follow-ups.mappers';

/** Outcomes that mean there is no point chasing this proposal any further. */
const CLOSING_OUTCOMES = ['READY_TO_BOOK', 'NOT_INTERESTED'] as const;

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: LeadActivityService,
    private readonly leads: LeadsRepository,
  ) {}

  // --- Rules ---------------------------------------------------------------

  /**
   * The schedule to use when none is named. Falls back to a hard-coded
   * day 1/3/5/7 only if the seeded row has been deleted — a follow-up engine
   * with no rule would silently stop scheduling anything, which is worse than
   * using a sensible default.
   */
  async defaultRule(): Promise<FollowUpRule | null> {
    return this.prisma.followUpRule.findFirst({ where: { isDefault: true, active: true } });
  }

  async listRules(): Promise<FollowUpRuleDto[]> {
    const rows = await this.prisma.followUpRule.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toFollowUpRule);
  }

  async saveRule(id: string | null, input: FollowUpRuleRequest): Promise<FollowUpRuleDto> {
    const data = {
      name: input.name,
      offsetDays: input.offsetDays,
      notifyAssignee: input.notifyAssignee,
      graceHours: input.graceHours,
      mandatory: input.mandatory,
      escalateAfterMissed: input.escalateAfterMissed ?? null,
      active: input.active,
    };

    return this.prisma.$transaction(async (tx) => {
      // Exactly one default. Clearing the others first keeps the partial
      // unique index in the database from rejecting the write.
      if (input.isDefault) {
        await tx.followUpRule.updateMany({
          where: id ? { isDefault: true, id: { not: id } } : { isDefault: true },
          data: { isDefault: false },
        });
      }

      const row = id
        ? await tx.followUpRule.update({
            where: { id },
            data: { ...data, isDefault: input.isDefault },
          })
        : await tx.followUpRule.create({ data: { ...data, isDefault: input.isDefault } });

      return toFollowUpRule(row);
    });
  }

  // --- Scheduling ----------------------------------------------------------

  /**
   * Creates the follow-up schedule for a submitted proposal.
   *
   * Called by the proposals service the moment a proposal is submitted. Safe
   * to call twice: the `(proposalId, sequence)` unique constraint means a
   * repeat submission cannot double-book the consultant's week.
   */
  async scheduleForProposal(input: {
    proposalId: string;
    leadId: string;
    assignedToId: string | null;
    submittedAt: Date;
  }): Promise<number> {
    const rule = await this.defaultRule();
    const offsets = rule?.offsetDays ?? [1, 3, 5, 7];

    if (offsets.length === 0) return 0;

    const rows = offsets.map((days, index) => ({
      proposalId: input.proposalId,
      leadId: input.leadId,
      ruleId: rule?.id ?? null,
      sequence: index + 1,
      // Due at the start of the working day, not at whatever minute the
      // proposal happened to be sent.
      dueAt: atNineAm(addDays(input.submittedAt, days)),
      assignedToId: input.assignedToId,
    }));

    const { count } = await this.prisma.followUp.createMany({ data: rows, skipDuplicates: true });

    if (count > 0) {
      await this.activities.record({
        leadId: input.leadId,
        type: 'FOLLOW_UP_SCHEDULED',
        summary: `${count} follow-ups scheduled — day ${offsets.join(', ')} after submission`,
      });

      // The soonest one drives the lead's own "next follow-up" field, which is
      // what the overdue filter on the lead list reads.
      await this.leads.setNextFollowUp(input.leadId, rows[0]!.dueAt);
    }

    return count;
  }

  /** Drops the remaining schedule when there is no longer anything to chase. */
  async cancelRemaining(proposalId: string, reason: string): Promise<number> {
    const { count } = await this.prisma.followUp.updateMany({
      where: { proposalId, status: { in: ['PENDING', 'DUE'] } },
      data: { status: 'CANCELLED', nextAction: reason },
    });
    return count;
  }

  // --- Reading -------------------------------------------------------------

  async list(query: FollowUpQuery, actor: AuthenticatedUser): Promise<FollowUp[]> {
    const where: Prisma.FollowUpWhereInput = { AND: [this.scopeFor(actor)] };
    const and = where.AND as Prisma.FollowUpWhereInput[];

    if (query.status) and.push({ status: query.status });
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    if (query.leadId) and.push({ leadId: query.leadId });

    if (query.due === 'today') {
      and.push({ status: { in: ['PENDING', 'DUE'] }, dueAt: { lt: endOfToday() } });
    }
    if (query.due === 'upcoming') {
      and.push({ status: { in: ['PENDING', 'DUE'] }, dueAt: { gte: endOfToday() } });
    }
    if (query.due === 'overdue') {
      and.push({ status: { in: ['PENDING', 'DUE'] }, dueAt: { lt: new Date() } });
    }

    const rows = await this.prisma.followUp.findMany({
      where,
      include: followUpInclude,
      orderBy: { dueAt: 'asc' },
      take: query.limit ?? 200,
    });

    return rows.map(toFollowUp);
  }

  async listForLead(leadId: string, actor: AuthenticatedUser): Promise<FollowUp[]> {
    return this.list({ leadId }, actor);
  }

  // --- Completing ----------------------------------------------------------

  /**
   * Records what happened. This is the only thing that closes a follow-up —
   * the scheduler never marks one done, because it has no way to know.
   */
  async complete(
    id: string,
    input: FollowUpCompleteRequest,
    actor: AuthenticatedUser,
  ): Promise<FollowUp> {
    const record = await this.findVisible(id, actor);

    if (record.status === 'COMPLETED') {
      throw new BadRequestException('That follow-up has already been recorded.');
    }
    if (record.status === 'CANCELLED') {
      throw new BadRequestException('That follow-up was cancelled.');
    }

    const updated = await this.prisma.followUp.update({
      where: { id },
      data: {
        // A follow-up done late is still done. It stays visibly late through
        // `completedAt` against `dueAt` rather than being recorded as missed.
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: actor.id,
        comment: input.comment,
        contactMethod: input.contactMethod,
        outcome: input.outcome,
        nextAction: input.nextAction ?? null,
      },
      include: followUpInclude,
    });

    await this.activities.record({
      leadId: record.leadId,
      type: 'FOLLOW_UP_COMPLETED',
      summary: `Follow-up ${record.sequence} — ${outcomeLabel(input.outcome)} via ${contactLabel(input.contactMethod)}`,
      detail: input.comment,
      actorId: actor.id,
    });

    // A customer who is ready to book, or has said no, should not keep
    // generating reminders.
    if ((CLOSING_OUTCOMES as readonly string[]).includes(input.outcome)) {
      const cancelled = await this.cancelRemaining(
        record.proposalId,
        `Closed by follow-up ${record.sequence}: ${outcomeLabel(input.outcome)}`,
      );
      if (cancelled > 0) {
        this.logger.log(`Cancelled ${cancelled} follow-ups on proposal ${record.proposalId}`);
      }
    }

    await this.leads.setNextFollowUp(
      record.leadId,
      input.nextFollowUpAt
        ? new Date(`${input.nextFollowUpAt}T09:00:00.000Z`)
        : await this.nextDueFor(record.leadId),
    );

    return toFollowUp(updated);
  }

  /** The soonest thing still owed on a lead, or null. */
  private async nextDueFor(leadId: string): Promise<Date | null> {
    const next = await this.prisma.followUp.findFirst({
      where: { leadId, status: { in: ['PENDING', 'DUE'] } },
      orderBy: { dueAt: 'asc' },
      select: { dueAt: true },
    });
    return next?.dueAt ?? null;
  }

  /** An employee sees the follow-ups on leads they can see; an admin sees all. */
  private scopeFor(actor: AuthenticatedUser): Prisma.FollowUpWhereInput {
    if (actor.role === 'ADMIN') return {};
    return {
      OR: [
        { assignedToId: actor.id },
        { lead: { assignedToId: actor.id } },
        { lead: { createdById: actor.id } },
      ],
    };
  }

  private async findVisible(id: string, actor: AuthenticatedUser): Promise<FollowUpWithRelations> {
    const record = await this.prisma.followUp.findUnique({
      where: { id },
      include: followUpInclude,
    });

    const visible =
      record &&
      (actor.role === 'ADMIN' ||
        record.assignedToId === actor.id ||
        record.lead.assignedToId === actor.id ||
        record.lead.createdById === actor.id);

    if (!record || !visible) {
      throw new NotFoundException('That follow-up no longer exists.');
    }

    return record;
  }
}

function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** 09:00 UTC — the start of the working day, rather than a random minute. */
function atNineAm(date: Date): Date {
  const result = new Date(date);
  result.setUTCHours(9, 0, 0, 0);
  return result;
}

function endOfToday(): Date {
  const result = new Date();
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

const OUTCOME_LABELS: Record<string, string> = {
  NO_RESPONSE: 'No response',
  INTERESTED: 'Interested',
  NEEDS_TIME: 'Needs time',
  NEGOTIATING: 'Negotiating',
  REQUESTED_CHANGES: 'Requested changes',
  READY_TO_BOOK: 'Ready to book',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

const CONTACT_LABELS: Record<string, string> = {
  PHONE: 'phone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'email',
  IN_PERSON: 'in person',
  OTHER: 'other',
};

function outcomeLabel(value: string): string {
  return OUTCOME_LABELS[value] ?? value;
}

function contactLabel(value: string): string {
  return CONTACT_LABELS[value] ?? value;
}
