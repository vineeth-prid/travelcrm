'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  Proposal,
  ProposalRequest,
  ProposalStatusRequest,
  ProposalWithHistory,
  ProposalWithPdf,
} from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useLeadProposals(leadId: string): UseQueryResult<Proposal[]> {
  return useQuery({
    queryKey: queryKeys.leadProposals(leadId),
    queryFn: ({ signal }) => api.proposals.listFor(leadId, signal),
  });
}

export function useProposal(id: string): UseQueryResult<ProposalWithHistory> {
  return useQuery({
    queryKey: queryKeys.proposal(id),
    queryFn: ({ signal }) => api.proposals.get(id, signal),
  });
}

/**
 * Anything that changes a proposal also changes its lead — the stage moves and
 * the timeline gains an entry — so all of it is refreshed together.
 */
function useProposalMutation<TVariables, TResult>(
  leadId: string,
  proposalId: string | null,
  mutationFn: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadProposals(leadId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lead(leadId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadActivities(leadId) });
      if (proposalId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.proposal(proposalId) });
      }
    },
  });
}

export function useCreateProposal(
  leadId: string,
): UseMutationResult<Proposal, Error, ProposalRequest> {
  return useProposalMutation(leadId, null, (input: ProposalRequest) =>
    api.proposals.create(leadId, input),
  );
}

export function useUpdateProposal(
  leadId: string,
  id: string,
): UseMutationResult<Proposal, Error, ProposalRequest> {
  return useProposalMutation(leadId, id, (input: ProposalRequest) =>
    api.proposals.update(id, input),
  );
}

export function useReviseProposal(
  leadId: string,
  id: string,
): UseMutationResult<Proposal, Error, ProposalRequest> {
  return useProposalMutation(leadId, id, (input: ProposalRequest) =>
    api.proposals.revise(id, input),
  );
}

export function useGenerateProposalPdf(
  leadId: string,
  id: string,
): UseMutationResult<ProposalWithPdf, Error, void> {
  return useProposalMutation(leadId, id, () => api.proposals.generatePdf(id));
}

export function useSubmitProposal(
  leadId: string,
  id: string,
): UseMutationResult<Proposal, Error, void> {
  return useProposalMutation(leadId, id, () => api.proposals.submit(id));
}

export function useSetProposalStatus(
  leadId: string,
  id: string,
): UseMutationResult<Proposal, Error, ProposalStatusRequest> {
  return useProposalMutation(leadId, id, (input: ProposalStatusRequest) =>
    api.proposals.setStatus(id, input),
  );
}
