import type { FollowUpOutcome, FollowUpStatus } from '@travel-crm/sdk';

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  PENDING: 'Scheduled',
  DUE: 'Due',
  COMPLETED: 'Done',
  MISSED: 'Missed',
  CANCELLED: 'Cancelled',
};

export const FOLLOW_UP_STATUS_VARIANTS: Record<
  FollowUpStatus,
  'neutral' | 'primary' | 'success' | 'danger' | 'warning'
> = {
  PENDING: 'neutral',
  DUE: 'primary',
  COMPLETED: 'success',
  MISSED: 'danger',
  CANCELLED: 'neutral',
};

export const OUTCOME_LABELS: Record<FollowUpOutcome, string> = {
  NO_RESPONSE: 'No response',
  INTERESTED: 'Interested',
  NEEDS_TIME: 'Needs time',
  NEGOTIATING: 'Negotiating',
  REQUESTED_CHANGES: 'Requested changes',
  READY_TO_BOOK: 'Ready to book',
  NOT_INTERESTED: 'Not interested',
  OTHER: 'Other',
};

/** Outcomes that end the schedule, flagged so the consultant is not surprised. */
export const CLOSING_OUTCOMES: FollowUpOutcome[] = ['READY_TO_BOOK', 'NOT_INTERESTED'];
