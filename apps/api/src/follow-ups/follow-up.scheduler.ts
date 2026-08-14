import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import type { Env } from '../config/env';
import { LeadActivityService } from '../leads/lead-activity.service';
import { dedupeKeyFor, NotificationService } from '../notifications/notification.service';
import { followUpDue, followUpEscalated, missedFollowUp } from '../notifications/templates';
import { PrismaService } from '../shared/prisma.service';
import { daysOverdue, followUpInclude, type FollowUpWithRelations } from './follow-ups.mappers';
import { FollowUpsService } from './follow-ups.service';

/** Money, the way the emails should read it. */
function money(currency: string, amount: number): string {
  return `${currency} ${new Intl.NumberFormat('en-IN').format(amount)}`;
}

function longDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface SweepResult {
  becameDue: number;
  becameMissed: number;
  escalated: number;
  expiredProposals: number;
  notificationsSent: number;
}

/**
 * The clock behind the follow-up engine.
 *
 * Every pass is idempotent by construction: each step selects only rows in the
 * state *before* the one it writes, so a second run in the same minute finds
 * nothing left to do. Notifications are deduplicated separately, by a unique
 * key in the database, so even two schedulers racing cannot double-send.
 *
 * Runs hourly rather than by the minute — a follow-up is a thing a person does
 * during a working day, and an hour's precision is ample for one.
 */
@Injectable()
export class FollowUpScheduler {
  private readonly logger = new Logger(FollowUpScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly followUps: FollowUpsService,
    private readonly notifications: NotificationService,
    private readonly activities: LeadActivityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async hourly(): Promise<void> {
    try {
      const result = await this.sweep();
      const worked =
        result.becameDue + result.becameMissed + result.escalated + result.expiredProposals;

      if (worked > 0) {
        this.logger.log(JSON.stringify(result));
      }
    } catch (error) {
      // A failing sweep must never take the process down with it; the next
      // hour's pass will pick up whatever was left.
      this.logger.error(
        `Follow-up sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Exposed so it can be run on demand, and asserted against in tests. */
  async sweep(now = new Date()): Promise<SweepResult> {
    const result: SweepResult = {
      becameDue: 0,
      becameMissed: 0,
      escalated: 0,
      expiredProposals: 0,
      notificationsSent: 0,
    };

    result.notificationsSent += await this.markDue(now, result);
    result.notificationsSent += await this.markMissed(now, result);
    result.expiredProposals = await this.expireProposals(now);

    return result;
  }

  /** PENDING → DUE, and tell whoever owes the call. */
  private async markDue(now: Date, result: SweepResult): Promise<number> {
    const due = await this.prisma.followUp.findMany({
      where: { status: 'PENDING', dueAt: { lte: now } },
      include: followUpInclude,
      take: 200,
    });

    if (due.length === 0) return 0;

    await this.prisma.followUp.updateMany({
      where: { id: { in: due.map((item) => item.id) }, status: 'PENDING' },
      data: { status: 'DUE' },
    });
    result.becameDue = due.length;

    let sent = 0;
    for (const followUp of due) {
      if (!(await this.shouldNotify(followUp))) continue;
      const recipient = this.recipientFor(followUp);
      if (!recipient) continue;

      const email = followUpDue({
        companyName: this.companyName,
        employeeName: recipient.name,
        customerName: followUp.lead.customer.name,
        destination: followUp.lead.destination,
        proposalReference: followUp.proposal.reference,
        proposalValue: this.proposalValueOf(followUp),
        dueOn: longDate(followUp.dueAt),
        sequence: followUp.sequence,
        leadUrl: `${this.notifications.appUrl}/leads/${followUp.leadId}`,
      });

      if (
        await this.notifications.send({
          type: 'FOLLOW_UP_DUE',
          recipient,
          dedupeKey: dedupeKeyFor('FOLLOW_UP_DUE', followUp.id),
          email,
        })
      ) {
        sent += 1;
      }
    }

    return sent;
  }

  /**
   * DUE → MISSED once the grace period has passed with nothing recorded.
   *
   * The grace period matters: a follow-up due at 09:00 that somebody makes at
   * 16:00 is a follow-up made, not a follow-up missed, and telling the
   * consultant off for it would teach them to ignore the emails.
   */
  private async markMissed(now: Date, result: SweepResult): Promise<number> {
    const rule = await this.followUps.defaultRule();
    const graceMs = (rule?.graceHours ?? 24) * 3_600_000;
    const cutoff = new Date(now.getTime() - graceMs);

    const missed = await this.prisma.followUp.findMany({
      where: { status: 'DUE', dueAt: { lte: cutoff } },
      include: followUpInclude,
      take: 200,
    });

    if (missed.length === 0) return 0;

    await this.prisma.followUp.updateMany({
      where: { id: { in: missed.map((item) => item.id) }, status: 'DUE' },
      data: { status: 'MISSED' },
    });
    result.becameMissed = missed.length;

    let sent = 0;
    for (const followUp of missed) {
      await this.activities.record({
        leadId: followUp.leadId,
        type: 'FOLLOW_UP_MISSED',
        summary: `Follow-up ${followUp.sequence} missed — due ${longDate(followUp.dueAt)}`,
      });

      const recipient = this.recipientFor(followUp);
      if (recipient && (await this.shouldNotify(followUp))) {
        const email = missedFollowUp({
          companyName: this.companyName,
          employeeName: recipient.name,
          customerName: followUp.lead.customer.name,
          destination: followUp.lead.destination,
          proposalReference: followUp.proposal.reference,
          proposalValue: this.proposalValueOf(followUp),
          dueOn: longDate(followUp.dueAt),
          daysOverdue: Math.max(1, daysOverdue(followUp.dueAt, now)),
          leadUrl: `${this.notifications.appUrl}/leads/${followUp.leadId}`,
        });

        if (
          await this.notifications.send({
            type: 'FOLLOW_UP_MISSED',
            recipient,
            // Per follow-up, not per sweep: this is what makes it one email.
            dedupeKey: dedupeKeyFor('FOLLOW_UP_MISSED', followUp.id),
            email,
          })
        ) {
          sent += 1;
        }
      }

      sent += await this.escalate(followUp, result);
    }

    return sent;
  }

  /** Tells the administrators when one proposal keeps being neglected. */
  private async escalate(followUp: FollowUpWithRelations, result: SweepResult): Promise<number> {
    const rule = followUp.ruleId
      ? await this.prisma.followUpRule.findUnique({ where: { id: followUp.ruleId } })
      : await this.followUps.defaultRule();

    const threshold = rule?.escalateAfterMissed;
    if (!threshold) return 0;

    const missedCount = await this.prisma.followUp.count({
      where: { proposalId: followUp.proposalId, status: 'MISSED' },
    });

    if (missedCount < threshold) return 0;

    let sent = 0;
    for (const admin of await this.notifications.admins()) {
      const email = followUpEscalated({
        companyName: this.companyName,
        customerName: followUp.lead.customer.name,
        employeeName: followUp.assignedTo?.name ?? 'nobody',
        proposalReference: followUp.proposal.reference,
        missedCount,
        leadUrl: `${this.notifications.appUrl}/leads/${followUp.leadId}`,
      });

      if (
        await this.notifications.send({
          type: 'FOLLOW_UP_ESCALATED',
          recipient: admin,
          // Keyed on the count too, so a proposal that goes on being ignored
          // escalates again at the next threshold rather than once forever.
          dedupeKey: dedupeKeyFor(
            'FOLLOW_UP_ESCALATED',
            followUp.proposalId,
            String(missedCount),
            admin.id,
          ),
          email,
        })
      ) {
        sent += 1;
      }
    }

    if (sent > 0) result.escalated += 1;
    return sent;
  }

  /**
   * Marks proposals expired once their validity has passed (§35E).
   *
   * Only ones still in play: an accepted or rejected proposal has an outcome
   * already, and overwriting it with EXPIRED would lose it.
   */
  private async expireProposals(now: Date): Promise<number> {
    const candidates = await this.prisma.proposal.findMany({
      where: { status: { in: ['GENERATED', 'SENT', 'FOLLOW_UP', 'NEGOTIATION'] } },
      select: { id: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
      take: 500,
    });

    const expired = candidates
      .filter((proposal) => {
        const validUntil = proposal.versions[0]?.validUntil;
        return validUntil !== undefined && validUntil.getTime() < now.getTime();
      })
      .map((proposal) => proposal.id);

    if (expired.length === 0) return 0;

    const { count } = await this.prisma.proposal.updateMany({
      where: {
        id: { in: expired },
        status: { in: ['GENERATED', 'SENT', 'FOLLOW_UP', 'NEGOTIATION'] },
      },
      data: { status: 'EXPIRED' },
    });

    for (const proposalId of expired) {
      await this.followUps.cancelRemaining(proposalId, 'Proposal expired');
    }

    return count;
  }

  private get companyName(): string {
    return this.config.get('COMPANY_NAME', { infer: true });
  }

  /** Naming: not `valueOf`, which would shadow Object.valueOf and break the
   * class decorator in a spectacularly unhelpful way. */
  private proposalValueOf(followUp: FollowUpWithRelations): string {
    const version = followUp.proposal.versions[0];
    return money(version?.currency ?? 'INR', version?.sellingPrice ?? 0);
  }

  /** Honours the rule's `notifyAssignee` switch. */
  private async shouldNotify(followUp: FollowUpWithRelations): Promise<boolean> {
    if (!followUp.ruleId) return true;
    const rule = await this.prisma.followUpRule.findUnique({ where: { id: followUp.ruleId } });
    return rule?.notifyAssignee ?? true;
  }

  private recipientFor(
    followUp: FollowUpWithRelations,
  ): { id: string; email: string; name: string } | null {
    const user = followUp.assignedTo;
    if (!user || !user.active) return null;
    return { id: user.id, email: user.email, name: user.name };
  }
}
