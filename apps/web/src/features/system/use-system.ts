'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AppInfo, HealthResponse } from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useHealth(): UseQueryResult<HealthResponse> {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: ({ signal }) => api.system.health(signal),
    refetchInterval: 30_000,
  });
}

export function useAppInfo(): UseQueryResult<AppInfo> {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: ({ signal }) => api.system.appInfo(signal),
    staleTime: 5 * 60_000,
  });
}
