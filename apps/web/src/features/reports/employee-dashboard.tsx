'use client';

import { isFollowUpOverdue } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingState,
  PageContainer,
} from '@travel-crm/ui';
import { CalendarClock, Users } from 'lucide-react';
import Link from 'next/link';

import { useFollowUps } from '@/features/follow-ups/use-follow-ups';
import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { useLeads } from '@/features/leads/use-leads';
import { usePerformance } from './use-reports';

/**
 * What a consultant sees instead of the admin dashboard.
 *
 * Their own numbers and their own work — no company revenue, no company
 * margin, no expenses. The API would refuse those anyway; this is the version
 * that is actually useful to them.
 */
export function EmployeeDashboard({ name }: { name: string }) {
  const performance = usePerformance({});
  const followUps = useFollowUps({ due: 'today' });
  const leads = useLeads({ pageSize: 5, sort: 'lastActivityAt', direction: 'desc' });

  const me = performance.data?.rows[0];
  const currency = performance.data?.currency ?? 'INR';

  return (
    <PageContainer
      width="full"
      title={`Welcome back, ${name.split(' ')[0]}`}
      description="Your leads, your follow-ups and how the last twelve months have gone."
    >
      <div className="flex flex-col gap-6">
        {performance.isPending ? (
          <LoadingState label="Loading your numbers…" />
        ) : me ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Leads assigned" value={String(me.leadsAssigned)} />
            <Figure label="Proposals sent" value={String(me.proposalsCreated)} />
            <Figure label="Proposal value" value={formatMoney(me.proposalValue, currency)} />
            <Figure
              label="Conversion"
              value={`${me.conversionRate}%`}
              note={me.missedFollowUps > 0 ? `${me.missedFollowUps} missed follow-ups` : undefined}
            />
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Owed today</CardTitle>
              <CardDescription>
                <Link href="/follow-ups" className="text-primary hover:underline">
                  All follow-ups
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {followUps.isPending ? (
                <LoadingState label="Loading…" />
              ) : (followUps.data?.length ?? 0) === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" aria-hidden />
                  Nothing owed today.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(followUps.data ?? []).slice(0, 6).map((followUp) => (
                    <li key={followUp.id}>
                      <Link
                        href={`/leads/${followUp.leadId}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-foreground">
                            {followUp.customerName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {followUp.proposalReference} · due{' '}
                            {formatDay(followUp.dueAt.slice(0, 10))}
                          </span>
                        </span>
                        {followUp.daysOverdue > 0 ? (
                          <Badge variant="danger">{followUp.daysOverdue}d late</Badge>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recently active leads</CardTitle>
              <CardDescription>
                <Link href="/leads" className="text-primary hover:underline">
                  All leads
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leads.isPending ? (
                <LoadingState label="Loading…" />
              ) : (leads.data?.leads.length ?? 0) === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="size-4" aria-hidden />
                  No leads yet.
                  <Button asChild size="sm" variant="secondary" className="ml-1">
                    <Link href="/leads/new">Create one</Link>
                  </Button>
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {(leads.data?.leads ?? []).map((lead) => (
                    <li key={lead.id}>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-foreground">{lead.customer.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {lead.reference}
                            {lead.destination ? ` · ${lead.destination}` : ''}
                          </span>
                        </span>
                        {isFollowUpOverdue(lead) ? <Badge variant="danger">Overdue</Badge> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {note ? (
        <p className="mt-2">
          <Badge variant="warning">{note}</Badge>
        </p>
      ) : null}
    </Card>
  );
}
