'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AppInfo, HealthResponse } from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useHealth(): UseQueryResult<HealthResponse> {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.system.health(signal),
    // Once a minute: this only answers "is the database up", and a poll per
    // 30 seconds on every open tab is a request per tab per half-minute for
    // an answer that almost never changes.
    refetchInterval: 60_000,
  });
}

export function useAppInfo(): UseQueryResult<AppInfo> {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: ({ signal }) => api.system.appInfo(signal),
    staleTime: 5 * 60_000,
  });
}
