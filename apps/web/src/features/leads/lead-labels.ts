import type {
  ActivityType,
  ContactMethod,
  LeadPriority,
  LeadSource,
  LeadStage,
  LostReason,
} from '@travel-crm/sdk';

/**
 * Enum → English, in one place. The API speaks in SCREAMING_CASE; nothing a
 * consultant reads should.
 */

export const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL_PREPARING: 'Preparing proposal',
  PROPOSAL_SENT: 'Proposal sent',
  FOLLOW_UP: 'Follow-up',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  ON_HOLD: 'On hold',
};

/**
 * Restrained on purpose: only the two outcomes and the one warning carry
 * colour. If every stage were a different colour the table would read as
 * decoration rather than information.
 */
export const STAGE_VARIANTS: Record<
  LeadStage,
  'neutral' | 'primary' | 'secondary' | 'success' | 'danger' | 'warning'
> = {
  NEW: 'primary',
  CONTACTED: 'neutral',
  QUALIFIED: 'secondary',
  PROPOSAL_PREPARING: 'neutral',
  PROPOSAL_SENT: 'secondary',
  FOLLOW_UP: 'neutral',
  NEGOTIATION: 'warning',
  WON: 'success',
  LOST: 'danger',
  ON_HOLD: 'neutral',
};

export const PRIORITY_LABELS: Record<LeadPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const PRIORITY_VARIANTS: Record<LeadPriority, 'neutral' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  MANUAL: 'Manual',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  PHONE: 'Phone',
  EMAIL: 'Email',
  WALK_IN: 'Walk-in',
  OTHER: 'Other',
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  BUDGET: 'Budget',
  CHOSE_COMPETITOR: 'Chose a competitor',
  DATES_CHANGED: 'Dates changed',
  TRIP_CANCELLED: 'Trip cancelled',
  NO_RESPONSE: 'No response',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  IN_PERSON: 'In person',
  OTHER: 'Other',
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: 'Lead created',
  STAGE_CHANGED: 'Stage changed',
  ASSIGNED: 'Assignment',
  NOTE: 'Note',
  REQUIREMENT_UPDATED: 'Details updated',
  AI_SUMMARY: 'AI summary',
  FOLLOW_UP_SCHEDULED: 'Follow-up scheduled',
  FOLLOW_UP_COMPLETED: 'Follow-up completed',
  FOLLOW_UP_MISSED: 'Follow-up missed',
  PROPOSAL_GENERATED: 'Proposal generated',
  PROPOSAL_SENT: 'Proposal sent',
  INVOICE_GENERATED: 'Invoice generated',
  PAYMENT_RECEIVED: 'Payment received',
};

/**
 * Money, as a travel consultant writes it. Whole units only — nobody quotes a
 * holiday to the paisa.
 */
export function formatMoney(amount: number | null, currency = 'INR'): string {
  if (amount === null) return '—';
  return `${currency} ${new Intl.NumberFormat('en-IN').format(amount)}`;
}

/** `2026-12-10` → `10 Dec 2026`. Dates are days, so they are parsed as UTC. */
export function formatDay(value: string | null): string {
  if (!value) return '—';
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3 days ago" / "in 2 days", for the last-activity and follow-up columns. */
export function formatRelative(value: string | null): string {
  if (!value) return '—';

  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days < 0 ? `${-days} days ago` : `in ${days} days`;
}
