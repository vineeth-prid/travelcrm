'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Dashboard, PerformanceReport, ReportQuery } from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useDashboard(query: ReportQuery): UseQueryResult<Dashboard> {
  return useQuery({
    queryKey: queryKeys.dashboard(query),
    queryFn: ({ signal }) => api.reports.dashboard(query, signal),
    placeholderData: (previous) => previous,
  });
}

export function usePerformance(query: ReportQuery): UseQueryResult<PerformanceReport> {
  return useQuery({
    queryKey: queryKeys.performance(query),
    queryFn: ({ signal }) => api.reports.performance(query, signal),
    placeholderData: (previous) => previous,
  });
}
