'use client';

import { Avatar, Badge, Button, Drawer, EmptyState, LoadingState } from '@travel-crm/ui';
import {
  ArrowLeft,
  Check,
  MessageSquareDashed,
  MessagesSquare,
  PanelRightOpen,
  ServerCrash,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CHANNEL_LABELS, ChannelIcon, STATUS_LABELS, STATUS_TONES } from './channel';
import { Composer } from './composer';
import { LeadPanel } from './lead-panel';
import { MessageBubble } from './message-bubble';
import { useConversation, useMessages } from './use-inbox';

interface ConversationViewProps {
  conversationId: string | null;
  /** Shown on small screens, where the list and the thread do not fit together. */
  onBack: () => void;
}

export function ConversationView({ conversationId, onBack }: ConversationViewProps) {
  const conversation = useConversation(conversationId);
  const messages = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // The composer draft lives here so the AI assistant in the lead panel can
  // write into it without the two components knowing about each other.
  const [draft, setDraft] = useState('');
  const [draftNotice, setDraftNotice] = useState(false);

  /** Accepts an AI draft and confirms it beside the composer for a moment. */
  function acceptAiDraft(reply: string) {
    setDraft(reply);
    setDraftNotice(true);
  }

  useEffect(() => {
    if (!draftNotice) return;
    const timer = setTimeout(() => setDraftNotice(false), 3000);
    return () => clearTimeout(timer);
  }, [draftNotice]);

  const lastMessageId = messages.data?.at(-1)?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lastMessageId, conversationId]);

  useEffect(() => {
    setDraft('');
    setDraftNotice(false);
    setDetailsOpen(false);
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <EmptyState
          icon={<MessagesSquare aria-hidden />}
          title="Select a conversation"
          description="Pick someone on the left to read the thread and reply."
        />
      </div>
    );
  }

  if (conversation.isError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <EmptyState
          icon={<ServerCrash aria-hidden />}
          title="Conversation unavailable"
          description={conversation.error.message}
          action={
            <Button variant="secondary" onClick={onBack}>
              Back to inbox
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={onBack}
            aria-label="Back to conversations"
          >
            <ArrowLeft aria-hidden />
          </Button>

          {conversation.data ? (
            <>
              <Avatar
                name={conversation.data.contact.name}
                src={conversation.data.contact.profilePicture}
                size="sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{conversation.data.contact.name}</p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ChannelIcon channel={conversation.data.channel} />
                  {CHANNEL_LABELS[conversation.data.channel]}
                  {conversation.data.contact.phone ? ` · ${conversation.data.contact.phone}` : ''}
                </p>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Badge variant={STATUS_TONES[conversation.data.status]}>
                  {STATUS_LABELS[conversation.data.status]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="xl:hidden"
                  onClick={() => setDetailsOpen(true)}
                  aria-label="Open lead details"
                >
                  <PanelRightOpen aria-hidden />
                </Button>
              </div>
            </>
          ) : null}
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.isPending ? (
            <LoadingState label="Loading messages…" />
          ) : messages.isError ? (
            <EmptyState
              icon={<ServerCrash aria-hidden />}
              title="Messages could not be loaded"
              description={messages.error.message}
            />
          ) : messages.data.length === 0 ? (
            <EmptyState
              icon={<MessageSquareDashed aria-hidden />}
              title="No messages yet"
              description="Send the first message to start this conversation."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.data.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>

        {draftNotice ? (
          <p
            role="status"
            className="flex items-center gap-2 border-t border-info-border bg-info-subtle px-4 py-2 text-xs text-info-foreground"
          >
            <Check className="size-3.5 shrink-0" aria-hidden />
            <span>
              <strong className="font-medium">AI draft inserted.</strong> Review before sending.
            </span>
          </p>
        ) : null}

        {conversation.data ? (
          <Composer
            conversationId={conversation.data.id}
            channel={conversation.data.channel}
            content={draft}
            onContentChange={setDraft}
          />
        ) : null}
      </div>

      {/* Wide screens keep the lead details beside the thread; narrower ones
          reach them through a drawer, so the salesperson never navigates away. */}
      {conversation.data ? (
        <>
          <aside className="hidden w-80 shrink-0 border-l border-border xl:block">
            <LeadPanel conversation={conversation.data} onReplyDrafted={acceptAiDraft} />
          </aside>

          <Drawer
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            title="Lead details"
            description={conversation.data.contact.name}
            className="max-w-sm xl:hidden"
          >
            <div className="-m-6 h-full">
              <LeadPanel
                conversation={conversation.data}
                onReplyDrafted={(reply) => {
                  acceptAiDraft(reply);
                  // The composer is behind this drawer; get out of the way.
                  setDetailsOpen(false);
                }}
              />
            </div>
          </Drawer>
        </>
      ) : null}
    </div>
  );
}
