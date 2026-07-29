'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Quote, QuoteRequest, QuoteWithPdf } from '@travel-crm/sdk';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useQuotes(conversationId: string): UseQueryResult<Quote[]> {
  return useQuery({
    queryKey: queryKeys.quotes(conversationId),
    queryFn: ({ signal }) => api.quotes.listFor(conversationId, signal),
  });
}

export function useCreateQuote(
  conversationId: string,
): UseMutationResult<Quote, Error, QuoteRequest, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: QuoteRequest) => api.quotes.create(conversationId, input),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes(conversationId) }),
  });
}

export function useUpdateQuote(
  conversationId: string,
  quoteId: string,
): UseMutationResult<Quote, Error, QuoteRequest, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: QuoteRequest) => api.quotes.update(quoteId, input),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes(conversationId) }),
  });
}

export function useGeneratePdf(
  conversationId: string,
): UseMutationResult<QuoteWithPdf, Error, string, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) => api.quotes.generatePdf(quoteId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes(conversationId) }),
  });
}

/** Sending also moves the lead to QUOTE_SENT, so the conversation is refreshed. */
export function useSendQuote(
  conversationId: string,
): UseMutationResult<QuoteWithPdf, Error, string, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (quoteId: string) => api.quotes.send(quoteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotes(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationsAll });
    },
  });
}
