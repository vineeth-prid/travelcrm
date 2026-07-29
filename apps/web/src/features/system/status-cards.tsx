'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@travel-crm/ui';
import type { ReactNode } from 'react';

import { useAppInfo, useHealth } from './use-system';

function StatCard({
  title,
  value,
  hint,
  loading,
}: {
  title: string;
  value: ReactNode;
  hint?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {loading ? <Skeleton className="h-6 w-24" /> : value}
        {hint && !loading ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function StatusCards() {
  const health = useHealth();
  const appInfo = useAppInfo();

  const apiUp = health.isSuccess && health.data.services.api === 'up';
  const databaseUp = health.isSuccess && health.data.services.database === 'up';

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        title="API status"
        loading={health.isPending}
        value={
          <Badge variant={apiUp ? 'success' : 'danger'}>
            {apiUp ? 'Operational' : 'Unreachable'}
          </Badge>
        }
        hint={
          health.isSuccess ? `Up for ${formatUptime(health.data.uptimeSeconds)}` : 'No response'
        }
      />
      <StatCard
        title="Database status"
        loading={health.isPending}
        value={
          <Badge variant={databaseUp ? 'success' : 'danger'}>
            {databaseUp ? 'Connected' : 'Disconnected'}
          </Badge>
        }
        hint="PostgreSQL via Prisma"
      />
      <StatCard
        title="Application version"
        loading={appInfo.isPending}
        value={
          <p className="font-mono text-lg font-semibold">
            {appInfo.isSuccess ? `v${appInfo.data.version}` : '—'}
          </p>
        }
        hint={appInfo.isSuccess ? `API ${appInfo.data.apiVersion}` : undefined}
      />
      <StatCard
        title="Build number"
        loading={appInfo.isPending}
        value={
          <p className="font-mono text-lg font-semibold">
            {appInfo.isSuccess ? appInfo.data.buildNumber : '—'}
          </p>
        }
        hint={appInfo.isSuccess ? appInfo.data.environment : undefined}
      />
    </div>
  );
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
