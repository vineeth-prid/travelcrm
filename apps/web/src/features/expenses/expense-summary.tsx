'use client';

import type { ExpenseSummary } from '@travel-crm/sdk';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@travel-crm/ui';

import { formatMoney } from '@/features/leads/lead-labels';

/** `2026-08` → `Aug 2026`. */
function monthLabel(month: string): string {
  const [year, index] = month.split('-');
  return new Date(Date.UTC(Number(year), Number(index) - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The expense dashboard.
 *
 * The trend is drawn with plain bars rather than a charting library: there is
 * one series and a dozen points, which does not justify 40kB of JavaScript.
 */
export function ExpenseSummaryPanel({ summary }: { summary: ExpenseSummary }) {
  const { currency } = summary;
  const peak = Math.max(1, ...summary.byMonth.map((point) => point.total));

  const change =
    summary.previousMonthTotal > 0
      ? Math.round(
          ((summary.currentMonthTotal - summary.previousMonthTotal) / summary.previousMonthTotal) *
            100,
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure
          label={`Total (${summary.count} expenses)`}
          value={formatMoney(summary.total, currency)}
        />
        <Figure
          label="This month"
          value={formatMoney(summary.currentMonthTotal, currency)}
          note={change === null ? undefined : `${change >= 0 ? '+' : ''}${change}% on last month`}
          noteVariant={change !== null && change > 0 ? 'danger' : 'success'}
        />
        <Figure label="Last month" value={formatMoney(summary.previousMonthTotal, currency)} />
      </div>

      {summary.otherCurrencies.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          These figures cover {currency} only. There is also spending in{' '}
          {summary.otherCurrencies.join(', ')} in this period — switch currency to see it. Amounts
          in different currencies are never added together.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Where the money went</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded in this period.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {summary.byCategory.map((row) => (
                  <li key={row.categoryId}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate text-foreground">{row.name}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatMoney(row.total, currency)}
                        <span className="ml-2 text-xs text-muted-foreground">{row.share}%</span>
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(1, row.share)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.byMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing recorded in this period.</p>
            ) : (
              <ol className="flex h-40 items-end gap-2">
                {summary.byMonth.map((point) => (
                  <li key={point.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(point.total / 1000)}k
                    </span>
                    <div
                      className="w-full rounded-t bg-secondary"
                      style={{ height: `${Math.max(2, (point.total / peak) * 100)}%` }}
                      title={`${monthLabel(point.month)}: ${formatMoney(point.total, currency)}`}
                    />
                    <span className="w-full truncate text-center text-[10px] text-muted-foreground">
                      {monthLabel(point.month).split(' ')[0]}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  noteVariant = 'neutral',
}: {
  label: string;
  value: string;
  note?: string;
  noteVariant?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {note ? (
        <p className="mt-2">
          <Badge variant={noteVariant}>{note}</Badge>
        </p>
      ) : null}
    </Card>
  );
}
