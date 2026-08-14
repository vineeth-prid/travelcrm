'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  FollowUp,
  FollowUpCompleteRequest,
  FollowUpQuery,
  FollowUpRule,
  FollowUpRuleRequest,
} from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useFollowUps(query: FollowUpQuery): UseQueryResult<FollowUp[]> {
  return useQuery({
    queryKey: queryKeys.followUps(query),
    queryFn: ({ signal }) => api.followUps.list(query, signal),
    placeholderData: (previous) => previous,
  });
}

/**
 * Completing one touches the lead as well — its timeline gains an entry and
 * its next-follow-up date moves — so everything is refreshed together.
 */
export function useCompleteFollowUp(
  leadId: string | null,
): UseMutationResult<FollowUp, Error, { id: string; input: FollowUpCompleteRequest }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => api.followUps.complete(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadsAll });
      if (leadId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.leadActivities(leadId) });
      }
    },
  });
}

export function useFollowUpRules(): UseQueryResult<FollowUpRule[]> {
  return useQuery({
    queryKey: queryKeys.followUpRules,
    queryFn: ({ signal }) => api.followUps.rules(signal),
  });
}

export function useSaveFollowUpRule(): UseMutationResult<
  FollowUpRule,
  Error,
  { id: string | null; input: FollowUpRuleRequest }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }) => api.followUps.saveRule(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.followUpRules }),
  });
}
