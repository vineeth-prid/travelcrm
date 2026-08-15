import type {
  Customer as CustomerRecord,
  FollowUp as FollowUpRecord,
  FollowUpRule as FollowUpRuleRecord,
  Invoice as InvoiceRecord,
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
  invoice: { include: { payments: { select: { amount: true } } } },
} as const;

export type FollowUpWithRelations = FollowUpRecord & {
  assignedTo: UserSummaryRecord | null;
  completedBy: UserSummaryRecord | null;
  lead: LeadRecord & { customer: CustomerRecord };
  /** Null on a LEAD or INVOICE follow-up. */
  proposal: (ProposalRecord & { versions: ProposalVersionRecord[] }) | null;
  /** Null unless this is chasing money. */
  invoice: (InvoiceRecord & { payments: { amount: number }[] }) | null;
};

/**
 * What a follow-up email should call the thing being chased.
 *
 * A proposal follow-up names the proposal, an invoice follow-up names the
 * invoice, and a bare enquiry has only its own reference to go on.
 */
export function subjectReference(record: FollowUpWithRelations): string {
  return record.proposal?.reference ?? record.invoice?.reference ?? record.lead.reference;
}

/**
 * How far past its due time an unactioned follow-up is, in whole days.
 * Negative until it is due.
 */
export function daysOverdue(dueAt: Date, now = new Date()): number {
  return Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
}

export function toFollowUp(record: FollowUpWithRelations): FollowUp {
  const version = record.proposal?.versions[0];
  const invoice = record.invoice;

  /**
   * What is at stake, in the terms of whatever is being chased: the price the
   * customer is holding, the money still owed, or — for a bare enquiry — the
   * budget they mentioned. Never a cost or a margin.
   */
  const stake = (): { currency: string; value: number } => {
    if (invoice) {
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      return { currency: invoice.currency, value: Math.max(0, invoice.totalAmount - paid) };
    }
    if (version) {
      return { currency: version.currency, value: version.sellingPrice };
    }
    return { currency: record.lead.currency, value: record.lead.budget ?? 0 };
  };

  const { currency, value } = stake();

  return {
    id: record.id,
    kind: record.kind,
    proposalId: record.proposalId,
    proposalReference: record.proposal?.reference ?? null,
    invoiceId: record.invoiceId,
    invoiceReference: invoice?.reference ?? null,
    leadId: record.leadId,
    leadReference: record.lead.reference,
    customerName: record.lead.customer.name,
    destination: record.lead.destination,
    reason: record.reason,
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
    currency,
    proposalValue: value,

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
