'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  DuplicateCheck,
  Lead,
  LeadActivity,
  LeadAssignRequest,
  LeadNoteRequest,
  LeadPage,
  LeadQuery,
  LeadRequest,
  LeadStageRequest,
  UserSummary,
} from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useLeads(query: LeadQuery): UseQueryResult<LeadPage> {
  return useQuery({
    queryKey: queryKeys.leads(query),
    queryFn: ({ signal }) => api.leads.list(query, signal),
    // Keeps the table on screen while a filter change is in flight, rather
    // than flashing a spinner over data that is about to be almost the same.
    placeholderData: (previous) => previous,
  });
}

export function useLead(id: string): UseQueryResult<Lead> {
  return useQuery({
    queryKey: queryKeys.lead(id),
    queryFn: ({ signal }) => api.leads.get(id, signal),
  });
}

export function useLeadActivities(id: string): UseQueryResult<LeadActivity[]> {
  return useQuery({
    queryKey: queryKeys.leadActivities(id),
    queryFn: ({ signal }) => api.leads.activities(id, signal),
  });
}

export function useStaff(): UseQueryResult<UserSummary[]> {
  return useQuery({
    queryKey: queryKeys.staff,
    queryFn: ({ signal }) => api.staff.list(signal),
    // Colleagues change about as often as the office moves.
    staleTime: 5 * 60_000,
  });
}

/**
 * Runs while the consultant is still typing, so the warning appears before the
 * lead is saved rather than as a failed save. `enabled` keeps it quiet until
 * there is enough of a number or address to be worth asking about.
 */
export function useDuplicateCheck(params: {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}): UseQueryResult<DuplicateCheck> {
  const phone = (params.phone ?? '').replace(/\D/g, '');
  const whatsapp = (params.whatsapp ?? '').replace(/\D/g, '');
  const email = params.email?.includes('@') ? params.email : '';
  const enabled = phone.length >= 8 || whatsapp.length >= 8 || email.length > 0;

  return useQuery({
    queryKey: queryKeys.leadDuplicates({ phone, whatsapp, email }),
    queryFn: ({ signal }) => api.leads.checkDuplicates({ phone, whatsapp, email }, signal),
    enabled,
  });
}

export function useCreateLead(): UseMutationResult<
  Lead,
  Error,
  { input: LeadRequest; allowDuplicate?: boolean }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ input, allowDuplicate }) => api.leads.create(input, { allowDuplicate }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.leadsAll }),
  });
}

/** Every lead mutation refreshes the same three things, so they share a helper. */
function useLeadMutation<TVariables, TResult>(
  id: string,
  mutationFn: (variables: TVariables) => Promise<TResult>,
): UseMutationResult<TResult, Error, TVariables> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lead(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadActivities(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leadsAll });
    },
  });
}

export function useUpdateLead(id: string): UseMutationResult<Lead, Error, LeadRequest> {
  return useLeadMutation(id, (input: LeadRequest) => api.leads.update(id, input));
}

export function useChangeStage(id: string): UseMutationResult<Lead, Error, LeadStageRequest> {
  return useLeadMutation(id, (input: LeadStageRequest) => api.leads.changeStage(id, input));
}

export function useAssignLead(id: string): UseMutationResult<Lead, Error, LeadAssignRequest> {
  return useLeadMutation(id, (input: LeadAssignRequest) => api.leads.assign(id, input));
}

export function useAddNote(id: string): UseMutationResult<LeadActivity, Error, LeadNoteRequest> {
  return useLeadMutation(id, (input: LeadNoteRequest) => api.leads.addNote(id, input));
}
