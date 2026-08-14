import type {
  Customer as CustomerRecord,
  Lead as LeadRecord,
  Proposal as ProposalRecord,
  ProposalVersion as ProposalVersionRecord,
} from '@prisma/client';
import { grossProfit, marginPercent, type Proposal, type ProposalVersion } from '@travel-crm/sdk';

import { toDateOnly } from '../leads/leads.mappers';
import { toUserSummary, userSummarySelect, type UserSummaryRecord } from '../users/users.service';

/** What every proposal query selects. Kept in one place so shapes cannot drift. */
export const proposalInclude = {
  lead: { include: { customer: true } },
  createdBy: { select: userSummarySelect },
  submittedBy: { select: userSummarySelect },
  versions: {
    include: { createdBy: { select: userSummarySelect } },
    orderBy: { version: 'desc' },
  },
} as const;

export type ProposalVersionWithAuthor = ProposalVersionRecord & {
  createdBy: UserSummaryRecord | null;
};

export type ProposalWithRelations = ProposalRecord & {
  lead: LeadRecord & { customer: CustomerRecord };
  createdBy: UserSummaryRecord | null;
  submittedBy: UserSummaryRecord | null;
  versions: ProposalVersionWithAuthor[];
};

/**
 * Whether a viewer may see cost and margin on a given proposal.
 *
 * An admin always may. An employee may only for a lead that is theirs, and
 * only if they have been given the permission — company-wide profitability is
 * never theirs to see. This is the single place the rule is written; both the
 * API responses and the reports go through it.
 */
export function canSeeFinancials(
  viewer: { id: string; role: string; canViewOwnProfitability: boolean },
  lead: { assignedToId: string | null; createdById: string | null },
): boolean {
  if (viewer.role === 'ADMIN') return true;
  if (!viewer.canViewOwnProfitability) return false;
  return lead.assignedToId === viewer.id || lead.createdById === viewer.id;
}

/**
 * A version as it goes over the wire.
 *
 * `withFinancials` is passed explicitly rather than defaulting to true: the
 * cost and margin have to be asked for, so forgetting to think about it means
 * they are absent rather than leaked.
 */
export function toProposalVersion(
  record: ProposalVersionWithAuthor,
  withFinancials: boolean,
): ProposalVersion {
  return {
    id: record.id,
    version: record.version,

    title: record.title,
    destination: record.destination,
    travelStart: toDateOnly(record.travelStart),
    travelEnd: toDateOnly(record.travelEnd),
    adults: record.adults,
    children: record.children,
    executiveSummary: record.executiveSummary,
    itinerary: record.itinerary,
    inclusions: record.inclusions,
    exclusions: record.exclusions,
    hotelInfo: record.hotelInfo,
    transportInfo: record.transportInfo,
    activities: record.activities,
    terms: record.terms,
    validUntil: toDateOnly(record.validUntil) ?? '',

    currency: record.currency,
    sellingPrice: record.sellingPrice,
    financials: withFinancials
      ? {
          actualCost: record.actualCost,
          // Derived on read from the two stored figures, so the three numbers
          // can never disagree with each other.
          grossProfit: grossProfit(record.sellingPrice, record.actualCost),
          marginPercent: marginPercent(record.sellingPrice, record.actualCost),
        }
      : null,

    hasPdf: record.pdfPath !== null,
    createdBy: record.createdBy ? toUserSummary(record.createdBy) : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** The current version is the highest-numbered one; `versions` is sorted desc. */
export function currentVersionOf(record: ProposalWithRelations): ProposalVersionWithAuthor {
  const current = record.versions[0];
  if (!current) {
    // Creation always writes version 1 in the same transaction, so this cannot
    // happen without the database having been edited by hand.
    throw new Error(`Proposal ${record.id} has no versions`);
  }
  return current;
}

export function toProposal(record: ProposalWithRelations, withFinancials: boolean): Proposal {
  const current = currentVersionOf(record);
  const settled = record.status === 'ACCEPTED' || record.status === 'REJECTED';

  return {
    id: record.id,
    reference: record.reference,
    leadId: record.leadId,
    leadReference: record.lead.reference,
    customerName: record.lead.customer.name,
    status: record.status,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    decidedAt: record.decidedAt?.toISOString() ?? null,
    createdBy: record.createdBy ? toUserSummary(record.createdBy) : null,
    submittedBy: record.submittedBy ? toUserSummary(record.submittedBy) : null,
    currentVersion: toProposalVersion(current, withFinancials),
    versionCount: record.versions.length,
    // Derived rather than stored, so it is right the moment validity lapses
    // instead of whenever a job next runs. A decided proposal never expires.
    isExpired: !settled && current.validUntil.getTime() < Date.now(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
