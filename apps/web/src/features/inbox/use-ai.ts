'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ConversationSummary, ExtractedDetails, SuggestedReply } from '@travel-crm/sdk';

import { api } from '@/lib/api';

/**
 * Assistive actions. None of them writes anything: the salesperson reviews the
 * result and then saves or sends it themselves.
 */
export function useSummarise(
  conversationId: string,
): UseMutationResult<ConversationSummary, Error, void, unknown> {
  return useMutation({ mutationFn: () => api.ai.summary(conversationId) });
}

export function useExtractDetails(
  conversationId: string,
): UseMutationResult<ExtractedDetails, Error, void, unknown> {
  return useMutation({ mutationFn: () => api.ai.extract(conversationId) });
}

export function useSuggestReply(
  conversationId: string,
): UseMutationResult<SuggestedReply, Error, void, unknown> {
  return useMutation({ mutationFn: () => api.ai.reply(conversationId) });
}
