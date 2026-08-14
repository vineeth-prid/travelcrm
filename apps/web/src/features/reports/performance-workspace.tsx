'use client';

import type { ReportQuery } from '@travel-crm/sdk';
import { Button, Card, EmptyState, Input, LoadingState, PageContainer } from '@travel-crm/ui';
import { BarChart3 } from 'lucide-react';
import { useState } from 'react';

import { PerformanceTable } from './performance-table';
import { usePerformance } from './use-reports';

function defaultFrom(): string {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - 11, 1);
  return date.toISOString().slice(0, 10);
}

export function PerformanceWorkspace({ isAdmin }: { isAdmin: boolean }) {
  const [range, setRange] = useState<ReportQuery>({ from: defaultFrom() });
  const report = usePerformance(range);

  return (
    <PageContainer
      width="full"
      title="Performance"
      description={
        isAdmin
          ? 'Every consultant, over the chosen period.'
          : 'Your own numbers, over the chosen period.'
      }
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
      <Card className="p-4">
        {report.isPending ? (
          <LoadingState label="Loading performance…" />
        ) : report.isError ? (
          <EmptyState
            icon={<BarChart3 aria-hidden />}
            title="Could not load performance"
            action={
              <Button variant="secondary" onClick={() => void report.refetch()}>
                Try again
              </Button>
            }
          />
        ) : (
          <PerformanceTable report={report.data} />
        )}
      </Card>
    </PageContainer>
  );
}
