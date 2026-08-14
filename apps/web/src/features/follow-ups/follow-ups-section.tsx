'use client';

import type { FollowUp } from '@travel-crm/sdk';
import { EmptyState, LoadingState } from '@travel-crm/ui';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';

import { CompleteDialog } from './complete-dialog';
import { FollowUpList } from './follow-up-list';
import { useFollowUps } from './use-follow-ups';

/** The follow-up schedule for one lead, on its detail page. */
export function FollowUpsSection({ leadId }: { leadId: string }) {
  const followUps = useFollowUps({ leadId });
  const [completing, setCompleting] = useState<FollowUp | null>(null);

  if (followUps.isPending) return <LoadingState label="Loading follow-ups…" />;

  if (followUps.isError) {
    return <EmptyState icon={<CalendarClock aria-hidden />} title="Could not load follow-ups" />;
  }

  if (followUps.data.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock aria-hidden />}
        title="No follow-ups scheduled"
        description="Submitting a proposal schedules them automatically."
      />
    );
  }

  return (
    <>
      <FollowUpList followUps={followUps.data} onComplete={setCompleting} showCustomer={false} />
      <CompleteDialog followUp={completing} onClose={() => setCompleting(null)} />
    </>
  );
}
