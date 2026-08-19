'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  FollowUpCreateRequest,
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

/**
 * Raising a follow-up by hand.
 *
 * Everything that could be showing one is invalidated, not just the list the
 * dialog was opened from: a follow-up recorded on an invoice belongs in the
 * Follow-ups menu too, and it used to take a page refresh to get there.
 * `refetchType: 'all'` is what does it — the default only refetches queries
 * that are currently mounted, and the list you are heading for is not.
 */
export function useCreateFollowUp(): UseMutationResult<FollowUp, Error, FollowUpCreateRequest> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: FollowUpCreateRequest) => api.followUps.create(input),
    onSuccess: (followUp) => {
      const refetch = { refetchType: 'all' as const };

      void queryClient.invalidateQueries({ queryKey: queryKeys.followUpsAll, ...refetch });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadsAll, ...refetch });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lead(followUp.leadId), ...refetch });

      // The proposal and invoice pages both show whether another follow-up may
      // be added, which this has just changed.
      if (followUp.proposalId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.proposal(followUp.proposalId),
          ...refetch,
        });
      }
      if (followUp.invoiceId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.invoice(followUp.invoiceId),
          ...refetch,
        });
      }
    },
  });
}
