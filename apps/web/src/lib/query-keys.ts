/** Single registry of TanStack Query keys, so invalidation never guesses. */
export const queryKeys = {
  session: ['session'] as const,
  health: ['system', 'health'] as const,
  appInfo: ['system', 'app-info'] as const,
  conversations: (search = '') => ['conversations', { search }] as const,
  conversationsAll: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id, 'detail'] as const,
  quotes: (conversationId: string) => ['conversations', conversationId, 'quotes'] as const,
  messages: (conversationId: string) => ['conversations', conversationId, 'messages'] as const,
};
