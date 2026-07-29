'use client';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@travel-crm/ui';
import { RefreshCw } from 'lucide-react';

import { publicEnv } from '@/lib/env';
import { formatUptime } from './status-cards';
import { useHealth } from './use-system';

export function ApiStatusCard() {
  const { data, isPending, isFetching, isError, refetch } = useHealth();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>API status</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          loading={isFetching}
          aria-label="Refresh status"
        >
          <RefreshCw aria-hidden />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-6 w-40" />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={!isError && data?.services.api === 'up' ? 'success' : 'danger'}>
              API {!isError && data?.services.api === 'up' ? 'operational' : 'unreachable'}
            </Badge>
            <Badge variant={!isError && data?.services.database === 'up' ? 'success' : 'danger'}>
              Database {!isError && data?.services.database === 'up' ? 'connected' : 'disconnected'}
            </Badge>
            {data ? (
              <span className="text-sm text-muted-foreground">
                up {formatUptime(data.uptimeSeconds)}
              </span>
            ) : null}
          </div>
        )}
        <p className="font-mono text-xs text-muted-foreground">{publicEnv.apiUrl}</p>
      </CardContent>
    </Card>
  );
}
