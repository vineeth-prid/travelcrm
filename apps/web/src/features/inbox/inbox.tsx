'use client';

import { cn } from '@travel-crm/ui';
import { useState } from 'react';

import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';
import { useConversations, useInboxStream } from './use-inbox';

export function Inbox() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conversations = useConversations(search);
  useInboxStream(selectedId);

  return (
    // The app header is 3.5rem tall; the inbox owns the rest of the viewport.
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <div className={cn('w-full sm:block sm:w-auto', selectedId && 'hidden')}>
        <ConversationList
          conversations={conversations.data}
          isPending={conversations.isPending}
          isError={conversations.isError}
          search={search}
          onSearchChange={setSearch}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <div className={cn('flex min-w-0 flex-1', !selectedId && 'hidden sm:flex')}>
        <ConversationView conversationId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    </div>
  );
}
