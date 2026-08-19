'use client';

import type { Dashboard, MarginStats, ReportQuery } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  LoadingState,
  PageContainer,
} from '@travel-crm/ui';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatMoney } from '@/features/leads/lead-labels';
import { PerformanceTable } from './performance-table';
import { useDashboard, usePerformance } from './use-reports';

/**
 * The first of the current month.
 *
 * A dashboard that opens on the last twelve months answers "how are we doing
 * overall", which is not the question anybody asks first thing. It rolls by
 * itself: the value is computed on each render, so on the 1st it moves.
 */
function defaultFrom(): string {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/**
 * The admin dashboard.
 *
 * Laid out to §41: the money first, the pipeline second, the people and the
 * spending last. The intent is that the top row alone answers "how is the
 * business doing" without scrolling.
 */
export function AdminDashboard({ name }: { name: string }) {
  const [range, setRange] = useState<ReportQuery>({ from: defaultFrom() });

  const dashboard = useDashboard(range);
  const performance = usePerformance(range);

  if (dashboard.isPending) return <LoadingState label="Building the dashboard…" />;

  if (dashboard.isError) {
    return (
      <PageContainer title="Dashboard">
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="Could not build the dashboard"
          action={
            <Button variant="secondary" onClick={() => void dashboard.refetch()}>
              Try again
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const data = dashboard.data;
  const { currency } = data;

  return (
    <PageContainer
      width="full"
      title={`Welcome back, ${name.split(' ')[0]}`}
      description={`${data.from} to ${data.to}, in ${currency}`}
      actions={
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            aria-label="From"
            value={range.from ?? ''}
            onChange={(event) => setRange({ ...range, from: event.target.value || undefined })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            aria-label="To"
            value={range.to ?? ''}
            onChange={(event) => setRange({ ...range, to: event.target.value || undefined })}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Top: the money. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Headline
            label="Accepted value"
            value={formatMoney(data.revenue.acceptedValue, currency)}
          />
          <Headline label="Collected" value={formatMoney(data.revenue.collectedAmount, currency)} />
          <Headline
            label="Outstanding"
            value={formatMoney(data.revenue.outstandingAmount, currency)}
            note={
              data.revenue.overdueAmount > 0
                ? `${formatMoney(data.revenue.overdueAmount, currency)} overdue`
                : undefined
            }
            noteVariant="danger"
          />
          <Headline
            label="Margin on won business"
            value={`${data.profitability.accepted.weightedMarginPercent}%`}
            note={`${formatMoney(data.profitability.accepted.grossProfit, currency)} gross profit`}
          />
        </div>

        {data.otherCurrencies.length > 0 ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            These figures cover {currency} only. There is also business in{' '}
            {data.otherCurrencies.join(', ')} in this period. Amounts in different currencies are
            never added together.
          </p>
        ) : null}

        {/* Middle: the pipeline. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales funnel</CardTitle>
              <CardDescription>
                {data.sales.conversionRate}% of decided leads were won.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Funnel sales={data.sales} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
              <CardDescription>Right now, not over the period.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <Tile label="Due" value={data.followUps.dueToday} href="/follow-ups" />
              <Tile label="Upcoming" value={data.followUps.upcoming} href="/follow-ups" />
              <Tile
                label="Overdue"
                value={data.followUps.overdue}
                href="/follow-ups"
                variant={data.followUps.overdue > 0 ? 'warning' : 'neutral'}
              />
              <Tile
                label="Missed"
                value={data.followUps.missed}
                href="/follow-ups"
                variant={data.followUps.missed > 0 ? 'danger' : 'neutral'}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Profitability</CardTitle>
              <CardDescription>
                Two figures because they disagree. The weighted one is what the business kept.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <MarginBlock stats={data.profitability.accepted} currency={currency} />
              <MarginBlock stats={data.profitability.submitted} currency={currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profit trend</CardTitle>
              <CardDescription>Revenue and gross profit on won business.</CardDescription>
            </CardHeader>
            <CardContent>
              <Trend points={data.profitTrend} currency={currency} />
            </CardContent>
          </Card>
        </div>

        {/* Bottom: people and spending. */}
        <Card>
          <CardHeader>
            <CardTitle>Team performance</CardTitle>
          </CardHeader>
          <CardContent>
            {performance.data ? (
              <PerformanceTable report={performance.data} />
            ) : (
              <LoadingState label="Loading performance…" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>
              <Link href="/expenses" className="text-primary hover:underline">
                Full expense dashboard
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Headline
                label="This month"
                value={formatMoney(data.expenses.currentMonth, currency)}
              />
              <Headline
                label="Last month"
                value={formatMoney(data.expenses.previousMonth, currency)}
              />
              <Headline
                label="Period total"
                value={formatMoney(data.expenses.periodTotal, currency)}
              />
            </div>

            {data.expenses.byCategory.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {data.expenses.byCategory.slice(0, 6).map((row) => (
                  <li key={row.categoryId}>
                    <Badge variant="secondary">
                      {row.name} · {formatMoney(row.total, currency)}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Funnel({ sales }: { sales: Dashboard['sales'] }) {
  const steps = [
    { label: 'Leads', value: sales.totalLeads },
    { label: 'Qualified', value: sales.qualifiedLeads },
    { label: 'Proposals created', value: sales.proposalsCreated },
    { label: 'Proposals sent', value: sales.proposalsSent },
    { label: 'Accepted', value: sales.proposalsAccepted },
    { label: 'Won', value: sales.wonLeads },
  ];

  const peak = Math.max(1, ...steps.map((step) => step.value));

  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step) => (
        <li key={step.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-foreground">{step.label}</span>
            <span className="tabular-nums text-foreground">{step.value}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(1, (step.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
      <li className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>Lost</span>
        <span className="tabular-nums">{sales.lostLeads}</span>
      </li>
    </ol>
  );
}

function MarginBlock({ stats, currency }: { stats: MarginStats; currency: string }) {
  const label = stats.population === 'ACCEPTED' ? 'Won business' : 'Everything offered';

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {stats.proposalCount} {stats.proposalCount === 1 ? 'proposal' : 'proposals'}
        </p>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Pair label="Revenue" value={formatMoney(stats.sellingTotal, currency)} />
        <Pair label="Cost" value={formatMoney(stats.costTotal, currency)} />
        <Pair label="Weighted" value={`${stats.weightedMarginPercent}%`} strong />
        <Pair label="Average" value={`${stats.averageMarginPercent}%`} />
      </dl>
    </div>
  );
}

function Trend({ points, currency }: { points: Dashboard['profitTrend']; currency: string }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No won business in this period.</p>;
  }

  const peak = Math.max(1, ...points.map((point) => point.revenue));

  return (
    <ol className="flex h-40 items-end gap-2">
      {points.map((point) => (
        <li key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="relative w-full rounded-t bg-secondary"
            style={{ height: `${Math.max(2, (point.revenue / peak) * 100)}%` }}
            title={`${point.month}: ${formatMoney(point.revenue, currency)} revenue, ${formatMoney(point.grossProfit, currency)} profit`}
          >
            {/* Profit shown inside revenue, so the gap is the cost. */}
            <div
              className="absolute bottom-0 w-full rounded-t bg-primary"
              style={{
                height: `${Math.max(0, (point.grossProfit / Math.max(1, point.revenue)) * 100)}%`,
              }}
            />
          </div>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">
            {point.month.slice(5)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Headline({
  label,
  value,
  note,
  noteVariant = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  noteVariant?: 'neutral' | 'danger';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {note ? (
        <p className="mt-2">
          <Badge variant={noteVariant}>{note}</Badge>
        </p>
      ) : null}
    </Card>
  );
}

function Tile({
  label,
  value,
  href,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  href: string;
  variant?: 'neutral' | 'warning' | 'danger';
}) {
  const tone =
    variant === 'danger'
      ? 'border-danger-border bg-danger-subtle'
      : variant === 'warning'
        ? 'border-warning-border bg-warning-subtle'
        : 'border-border';

  return (
    <Link
      href={href}
      className={`rounded-lg border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </Link>
  );
}

function Pair({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          strong
            ? 'mt-0.5 font-semibold tabular-nums text-foreground'
            : 'mt-0.5 tabular-nums text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  );
}
