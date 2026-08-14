'use client';

import type { LeadActivity } from '@travel-crm/sdk';
import { Button, EmptyState, LoadingState, Textarea, toast } from '@travel-crm/ui';
import { History } from 'lucide-react';
import { useState } from 'react';

import { ACTIVITY_LABELS, formatDateTime } from './lead-labels';
import { useAddNote, useLeadActivities } from './use-leads';

/**
 * The historical record of the relationship. Append-only: entries can be added
 * here, never edited or removed.
 */
export function LeadTimeline({ leadId }: { leadId: string }) {
  const activities = useLeadActivities(leadId);
  const addNote = useAddNote(leadId);
  const [note, setNote] = useState('');

  const submit = async () => {
    if (!note.trim()) return;
    try {
      await addNote.mutateAsync({ note: note.trim() });
      setNote('');
      toast.success('Note added');
    } catch {
      toast.error('The note could not be saved.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What happened? Calls, messages, what the customer asked for…"
          aria-label="Add a note to the timeline"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!note.trim()}
            loading={addNote.isPending}
            onClick={() => void submit()}
          >
            Add note
          </Button>
        </div>
      </div>

      {activities.isPending ? (
        <LoadingState label="Loading timeline…" />
      ) : activities.isError ? (
        <EmptyState icon={<History aria-hidden />} title="Could not load the timeline" />
      ) : (
        <ol className="flex flex-col">
          {activities.data.map((activity, index) => (
            <TimelineEntry
              key={activity.id}
              activity={activity}
              last={index === activities.data.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineEntry({ activity, last }: { activity: LeadActivity; last: boolean }) {
  return (
    <li className="flex gap-3">
      {/* The rail: a dot per entry, joined by a line that stops at the last. */}
      <div className="flex flex-col items-center">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
        {last ? null : <span className="w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className={last ? 'pb-1' : 'pb-5'}>
        <p className="text-sm font-medium text-foreground">{activity.summary}</p>
        {activity.detail ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {activity.detail}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {ACTIVITY_LABELS[activity.type]} · {formatDateTime(activity.createdAt)}
          {activity.actor ? ` · ${activity.actor.name}` : ''}
        </p>
      </div>
    </li>
  );
}
