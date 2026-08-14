'use client';

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@travel-crm/ui';
import { ServerCrash } from 'lucide-react';

import { publicEnv } from '@/lib/env';
import { useAppInfo, useHealth } from './use-system';

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
  // Polled, unlike the rest of this card: it is the one line that answers
  // "is it me or is it broken" when somebody reports a save that failed.
  const health = useHealth();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          System information
          {health.isPending ? (
            <Badge variant="neutral">Checking…</Badge>
          ) : health.data?.services.database === 'up' ? (
            <Badge variant="success">Database up</Badge>
          ) : (
            <Badge variant="danger">Database unreachable</Badge>
          )}
        </CardTitle>
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
