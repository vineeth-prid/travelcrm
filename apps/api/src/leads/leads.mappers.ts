import type {
  Customer as CustomerRecord,
  Lead as LeadRecord,
  LeadActivity as LeadActivityRecord,
} from '@prisma/client';
import type { Customer, Lead, LeadActivity } from '@travel-crm/sdk';

import { toUserSummary, userSummarySelect, type UserSummaryRecord } from '../users/users.service';

/** What every lead query selects. Kept in one place so shapes cannot drift. */
export const leadInclude = {
  customer: true,
  assignedTo: { select: userSummarySelect },
  createdBy: { select: userSummarySelect },
} as const;

export type LeadWithRelations = LeadRecord & {
  customer: CustomerRecord;
  assignedTo: UserSummaryRecord | null;
  createdBy: UserSummaryRecord | null;
};

export type LeadActivityWithActor = LeadActivityRecord & { actor: UserSummaryRecord | null };

/**
 * Travel and follow-up dates are days, not instants — the consultant picks
 * "3 December", not "3 December at 00:00 UTC". They are stored at UTC midnight
 * and handed back as plain `YYYY-MM-DD` so no timezone can shift them a day.
 */
export function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Parses a `YYYY-MM-DD` from a request into the Date the database stores. */
export function fromDateOnly(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function toCustomer(record: CustomerRecord): Customer {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    whatsapp: record.whatsapp,
    email: record.email,
    preferredContact: record.preferredContact,
    city: record.city,
    country: record.country,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toLead(record: LeadWithRelations): Lead {
  return {
    id: record.id,
    reference: record.reference,
    customer: toCustomer(record.customer),

    destination: record.destination,
    departureCity: record.departureCity,
    travelStart: toDateOnly(record.travelStart),
    travelEnd: toDateOnly(record.travelEnd),
    adults: record.adults,
    children: record.children,
    childAges: record.childAges,
    tripType: record.tripType,
    hotelCategory: record.hotelCategory,
    mealPreference: record.mealPreference,
    transportRequired: record.transportRequired,
    flightRequired: record.flightRequired,
    activityRequirements: record.activityRequirements,
    specialRequirements: record.specialRequirements,
    budget: record.budget,
    currency: record.currency,
    rawRequirement: record.rawRequirement,
    requirementSummary: record.requirementSummary,

    source: record.source,
    stage: record.stage,
    priority: record.priority,
    tags: record.tags,
    assignedTo: record.assignedTo ? toUserSummary(record.assignedTo) : null,
    createdBy: record.createdBy ? toUserSummary(record.createdBy) : null,
    lostReason: record.lostReason,
    lostNotes: record.lostNotes,
    nextAction: record.nextAction,
    nextFollowUpAt: toDateOnly(record.nextFollowUpAt),
    lastActivityAt: record.lastActivityAt.toISOString(),
    notes: record.notes,

    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toLeadActivity(record: LeadActivityWithActor): LeadActivity {
  return {
    id: record.id,
    leadId: record.leadId,
    type: record.type,
    summary: record.summary,
    detail: record.detail,
    actor: record.actor ? toUserSummary(record.actor) : null,
    createdAt: record.createdAt.toISOString(),
  };
}
