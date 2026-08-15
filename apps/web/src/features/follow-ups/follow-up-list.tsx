'use client';

import type { FollowUp } from '@travel-crm/sdk';
import { Badge, Button } from '@travel-crm/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';

import { formatDay, formatMoney, formatRelative } from '@/features/leads/lead-labels';
import {
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_STATUS_VARIANTS,
  OUTCOME_LABELS,
} from './follow-up-labels';

interface FollowUpListProps {
  followUps: FollowUp[];
  /** Omitted where the list is read-only, e.g. on a customer's page. */
  onComplete?: (followUp: FollowUp) => void;
  /** Hidden on the lead page, where the customer is already the heading. */
  showCustomer?: boolean;
}

export function FollowUpList({ followUps, onComplete, showCustomer = true }: FollowUpListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {followUps.map((followUp) => {
        const open = followUp.status === 'PENDING' || followUp.status === 'DUE';

        return (
          <li
            key={followUp.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {showCustomer ? (
                  <Link
                    href={`/leads/${followUp.leadId}`}
                    className="hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {followUp.customerName}
                  </Link>
                ) : (
                  `Follow-up ${followUp.sequence}`
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {showCustomer ? `Follow-up ${followUp.sequence} · ` : ''}
                {followUp.proposalReference}
                {followUp.destination ? ` · ${followUp.destination}` : ''}
                {' · due '}
                {formatDay(followUp.dueAt.slice(0, 10))}
                {open && followUp.daysOverdue > 0 ? ` (${formatRelative(followUp.dueAt)})` : ''}
              </span>

              {followUp.comment ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {followUp.outcome ? `${OUTCOME_LABELS[followUp.outcome]} — ` : ''}
                  {followUp.comment}
                </span>
              ) : null}
            </span>

            <Badge variant="accent">{formatMoney(followUp.proposalValue, followUp.currency)}</Badge>

            <Badge variant={FOLLOW_UP_STATUS_VARIANTS[followUp.status]}>
              {FOLLOW_UP_STATUS_LABELS[followUp.status]}
            </Badge>

            {followUp.assignedTo ? (
              <span className="text-xs text-muted-foreground">{followUp.assignedTo.name}</span>
            ) : null}

            {/* A missed follow-up can still be recorded — the call may just have
                happened late, and a record beats a permanent black mark. */}
            {!onComplete ||
            followUp.status === 'COMPLETED' ||
            followUp.status === 'CANCELLED' ? null : (
              <Button variant="secondary" size="sm" onClick={() => onComplete(followUp)}>
                <Check aria-hidden />
                Record
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
