import type {
  Customer as CustomerRecord,
  FollowUp as FollowUpRecord,
  FollowUpRule as FollowUpRuleRecord,
  Lead as LeadRecord,
  Proposal as ProposalRecord,
  ProposalVersion as ProposalVersionRecord,
} from '@prisma/client';
import type { FollowUp, FollowUpRule } from '@travel-crm/sdk';

import { toUserSummary, userSummarySelect, type UserSummaryRecord } from '../users/users.service';

/** What every follow-up query selects. */
export const followUpInclude = {
  assignedTo: { select: userSummarySelect },
  completedBy: { select: userSummarySelect },
  lead: { include: { customer: true } },
  proposal: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
} as const;

export type FollowUpWithRelations = FollowUpRecord & {
  assignedTo: UserSummaryRecord | null;
  completedBy: UserSummaryRecord | null;
  lead: LeadRecord & { customer: CustomerRecord };
  proposal: ProposalRecord & { versions: ProposalVersionRecord[] };
};

/**
 * How far past its due time an unactioned follow-up is, in whole days.
 * Negative until it is due.
 */
export function daysOverdue(dueAt: Date, now = new Date()): number {
  return Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
}

export function toFollowUp(record: FollowUpWithRelations): FollowUp {
  const version = record.proposal.versions[0];

  return {
    id: record.id,
    proposalId: record.proposalId,
    proposalReference: record.proposal.reference,
    leadId: record.leadId,
    leadReference: record.lead.reference,
    customerName: record.lead.customer.name,
    destination: record.lead.destination,
    sequence: record.sequence,
    dueAt: record.dueAt.toISOString(),
    status: record.status,
    assignedTo: record.assignedTo ? toUserSummary(record.assignedTo) : null,

    completedAt: record.completedAt?.toISOString() ?? null,
    completedBy: record.completedBy ? toUserSummary(record.completedBy) : null,
    comment: record.comment,
    contactMethod: record.contactMethod,
    outcome: record.outcome,
    nextAction: record.nextAction,

    // Customer-facing figure only. A follow-up list must not become a way to
    // read margins the viewer is not entitled to.
    currency: version?.currency ?? 'INR',
    proposalValue: version?.sellingPrice ?? 0,

    daysOverdue: record.status === 'COMPLETED' ? 0 : Math.max(0, daysOverdue(record.dueAt)),
    createdAt: record.createdAt.toISOString(),
  };
}

export function toFollowUpRule(record: FollowUpRuleRecord): FollowUpRule {
  return {
    id: record.id,
    name: record.name,
    offsetDays: record.offsetDays,
    notifyAssignee: record.notifyAssignee,
    graceHours: record.graceHours,
    mandatory: record.mandatory,
    escalateAfterMissed: record.escalateAfterMissed,
    isDefault: record.isDefault,
    active: record.active,
    updatedAt: record.updatedAt.toISOString(),
  };
}
