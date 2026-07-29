'use client';

import type { Conversation } from '@travel-crm/sdk';
import { Avatar, Badge, cn, EmptyState, SearchBox, Skeleton } from '@travel-crm/ui';
import { Inbox, SearchX } from 'lucide-react';

import { ChannelIcon, formatTimestamp, STATUS_LABELS, STATUS_TONES } from './channel';

interface ConversationListProps {
  conversations: Conversation[] | undefined;
  isPending: boolean;
  isError: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  isPending,
  isError,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: ConversationListProps) {
  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-surface sm:w-80">
      <div className="border-b border-border p-3">
        <SearchBox
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name or phone…"
          aria-label="Search conversations"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          <ul className="flex flex-col gap-1 p-3">
            {[0, 1, 2, 3, 4].map((row) => (
              <li key={row} className="flex items-center gap-3 px-1 py-2">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="mb-2 h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </li>
            ))}
          </ul>
        ) : isError ? (
          <EmptyState
            icon={<Inbox aria-hidden />}
            title="Conversations could not be loaded"
            description="The API did not respond. Check that it is running and try again."
          />
        ) : conversations?.length === 0 ? (
          <EmptyState
            icon={search ? <SearchX aria-hidden /> : <Inbox aria-hidden />}
            title={search ? 'No matches' : 'No conversations yet'}
            description={
              search
                ? 'No contact matches that name, phone, email or destination.'
                : 'Messages from Instagram and WhatsApp arrive here automatically. Each one becomes a lead you can qualify, quote and reply to without leaving this screen.'
            }
          />
        ) : (
          <ul>
            {conversations?.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { contact, unreadCount } = conversation;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          selected ? 'bg-primary-subtle' : 'hover:bg-muted',
        )}
      >
        <Avatar name={contact.name} src={contact.profilePicture} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <ChannelIcon channel={conversation.channel} />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                unreadCount > 0 ? 'font-semibold' : 'font-medium',
              )}
            >
              {contact.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTimestamp(conversation.lastMessageAt)}
            </span>
          </span>

          <span className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_TONES[conversation.status]} className="shrink-0 px-2 py-0">
              {STATUS_LABELS[conversation.status]}
            </Badge>
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-xs',
                unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {conversation.lastMessage ?? 'No messages yet'}
            </span>
            {unreadCount > 0 ? (
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
                aria-label={`${unreadCount} unread`}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}
