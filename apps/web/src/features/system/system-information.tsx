'use client';

import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@travel-crm/ui';
import { ServerCrash } from 'lucide-react';

import { publicEnv } from '@/lib/env';
import { useAppInfo } from './use-system';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-sm">{value}</dd>
    </div>
  );
}

export function SystemInformation() {
  const { data, isPending, isError } = useAppInfo();

  return (
    <Card>
      <CardHeader>
        <CardTitle>System information</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        ) : isError ? (
          <EmptyState
            icon={<ServerCrash aria-hidden />}
            title="System information is unavailable"
            description="The API did not respond. Check that it is running and try again."
            className="py-6"
          />
        ) : (
          <dl>
            <Row label="Application" value={data.name} />
            <Row label="Company (on quote PDFs)" value={data.companyName} />
            <Row
              label="Company logo"
              value={data.companyLogoConfigured ? 'Configured' : 'Not configured'}
            />
            <Row label="API version" value={data.apiVersion} />
            <Row label="API build" value={`${data.version} (${data.buildNumber})`} />
            <Row label="Environment" value={data.environment} />
            <Row label="Node.js" value={data.nodeVersion} />
            <Row label="API started" value={new Date(data.startedAt).toLocaleString()} />
            <Row label="Web build" value={`${publicEnv.appVersion} (${publicEnv.buildNumber})`} />
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
