'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Conversation, InboxEvent, Message, UpdateConversationRequest } from '@travel-crm/sdk';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export function useConversations(search: string): UseQueryResult<Conversation[]> {
  return useQuery({
    queryKey: queryKeys.conversations(search),
    queryFn: ({ signal }) => api.conversations.list({ search: search || undefined }, signal),
  });
}

/** Opening a conversation is also what clears its unread badge server-side. */
export function useConversation(id: string | null): UseQueryResult<Conversation> {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ''),
    queryFn: ({ signal }) => api.conversations.get(id as string, signal),
    enabled: id !== null,
  });
}

/** Saves the lead details captured beside the conversation. */
export function useUpdateConversation(
  conversationId: string,
): UseMutationResult<Conversation, Error, UpdateConversationRequest, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateConversationRequest) =>
      api.conversations.update(conversationId, input),
    onSuccess: (conversation) => {
      queryClient.setQueryData(queryKeys.conversation(conversationId), conversation);
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationsAll });
    },
  });
}

export function useMessages(conversationId: string | null): UseQueryResult<Message[]> {
  return useQuery({
    queryKey: queryKeys.messages(conversationId ?? ''),
    queryFn: ({ signal }) => api.conversations.messages(conversationId as string, signal),
    enabled: conversationId !== null,
  });
}

export function useSendMessage(
  conversationId: string,
): UseMutationResult<Message, Error, string, unknown> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => api.conversations.send(conversationId, { content }),
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(queryKeys.messages(conversationId), (current) =>
        current ? [...current, message] : [message],
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationsAll });
    },
  });
}

function isInboxEvent(value: unknown): value is InboxEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as InboxEvent).type === 'message' || (value as InboxEvent).type === 'conversation')
  );
}

/**
 * Keeps the inbox live. The API pushes over Server-Sent Events; we translate an
 * event into a cache invalidation rather than trusting it as the source of
 * truth, so a missed event self-heals on the next one.
 */
export function useInboxStream(activeConversationId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(api.conversations.eventsUrl(), { withCredentials: true });

    source.onmessage = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return; // heartbeat or malformed frame
      }
      if (!isInboxEvent(payload)) return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversationsAll });

      if (payload.type === 'message' && payload.conversationId === activeConversationId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages(payload.conversationId),
        });
      }
    };

    // EventSource reconnects on its own; nothing to do but stop the noise.
    source.onerror = () => undefined;

    return () => source.close();
  }, [queryClient, activeConversationId]);
}
