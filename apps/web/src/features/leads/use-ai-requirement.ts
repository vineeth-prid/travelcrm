'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { AiRequirementRequest, LeadRequirementDraft } from '@travel-crm/sdk';

import { api } from '@/lib/api';

/**
 * Tidies pasted notes into a lead draft.
 *
 * A mutation rather than a query on purpose: it runs when the consultant asks
 * for it, costs real time on a local model, and must never fire on its own.
 * Nothing is saved — the caller decides which suggested values to keep.
 */
export function useDraftRequirement(): UseMutationResult<
  LeadRequirementDraft,
  Error,
  AiRequirementRequest
> {
  return useMutation({
    mutationFn: (input: AiRequirementRequest) => api.ai.requirement(input),
  });
}
