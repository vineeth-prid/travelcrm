'use client';

import type { FollowUp, FollowUpQuery } from '@travel-crm/sdk';
import {
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageContainer,
  SearchBox,
  Tabs,
} from '@travel-crm/ui';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';

import { CompleteDialog } from './complete-dialog';
import { FollowUpList } from './follow-up-list';
import { RulesPanel } from './rules-panel';
import { useFollowUps } from './use-follow-ups';

/** The four views a consultant actually wants, rather than a filter builder. */
const VIEWS: { label: string; query: FollowUpQuery }[] = [
  { label: 'Due & overdue', query: { due: 'today' } },
  { label: 'Overdue', query: { due: 'overdue' } },
  { label: 'Missed', query: { status: 'MISSED' } },
  { label: 'Upcoming', query: { due: 'upcoming' } },
  { label: 'Done', query: { status: 'COMPLETED' } },
];

/** What is being chased. Three different jobs that happen to share a list. */
const KINDS = [
  { id: 'ALL', label: 'Everything' },
  { id: 'LEAD', label: 'Lead conversion' },
  { id: 'PROPOSAL', label: 'Proposals' },
  { id: 'INVOICE', label: 'Invoices' },
] as const;

export function FollowUpsWorkspace({ showRules = false }: { showRules?: boolean }) {
  const [view, setView] = useState(0);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('ALL');
  const [search, setSearch] = useState('');
  const [completing, setCompleting] = useState<FollowUp | null>(null);

  const followUps = useFollowUps({
    ...VIEWS[view]!.query,
    kind: kind === 'ALL' ? undefined : kind,
    search: search.trim() || undefined,
  });

  return (
    <PageContainer
      width="full"
      title="Follow-ups"
      description="Everything owed to a customer who is holding a proposal."
    >
      <div className="flex flex-col gap-4">
        <Tabs
          aria-label="What is being chased"
          items={KINDS}
          value={kind}
          onValueChange={(next) => setKind(next as (typeof KINDS)[number]['id'])}
        />

        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            className="min-w-56 flex-1 sm:max-w-xs"
            placeholder="Customer name, reference or destination"
            aria-label="Search follow-ups"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {VIEWS.map((item, index) => (
            <Button
              key={item.label}
              variant={index === view ? 'primary' : 'secondary'}
              size="sm"
              aria-pressed={index === view}
              onClick={() => setView(index)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <Card className="p-4">
          {followUps.isPending ? (
            <LoadingState label="Loading follow-ups…" />
          ) : followUps.isError ? (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="Could not load follow-ups"
              action={
                <Button variant="secondary" onClick={() => void followUps.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : followUps.data.length === 0 ? (
            <EmptyState
              icon={<CalendarClock aria-hidden />}
              title="Nothing here"
              description="Follow-ups appear automatically when a proposal is submitted."
            />
          ) : (
            <FollowUpList followUps={followUps.data} onComplete={setCompleting} />
          )}
        </Card>

        {showRules ? <RulesPanel /> : null}
      </div>

      <CompleteDialog followUp={completing} onClose={() => setCompleting(null)} />
    </PageContainer>
  );
}
