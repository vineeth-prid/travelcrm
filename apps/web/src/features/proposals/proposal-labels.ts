import type { ProposalStatus } from '@travel-crm/sdk';

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  DRAFT: 'Draft',
  GENERATED: 'PDF ready',
  SENT: 'Sent',
  FOLLOW_UP: 'Following up',
  NEGOTIATION: 'Negotiating',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export const PROPOSAL_STATUS_VARIANTS: Record<
  ProposalStatus,
  'neutral' | 'primary' | 'secondary' | 'success' | 'danger' | 'warning'
> = {
  DRAFT: 'neutral',
  GENERATED: 'secondary',
  SENT: 'primary',
  FOLLOW_UP: 'neutral',
  NEGOTIATION: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

/**
 * How healthy a margin looks at a glance.
 *
 * The thresholds are a display convenience only — nothing decides anything
 * from them, and they are nowhere near the calculation itself.
 */
export function marginVariant(percent: number): 'success' | 'warning' | 'danger' {
  if (percent < 0) return 'danger';
  if (percent < 10) return 'warning';
  return 'success';
}
