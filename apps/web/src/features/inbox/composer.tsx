'use client';

import {
  ApiError,
  REPLYABLE_CHANNELS,
  replyWindowRemainingMs,
  type Channel,
} from '@travel-crm/sdk';
import { Button, Textarea, toast } from '@travel-crm/ui';
import { Clock, Send } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { useSendMessage } from './use-inbox';

interface ComposerProps {
  conversationId: string;
  channel: Channel;
  /** When the customer last wrote in; drives the 24-hour reply window notice. */
  lastInboundAt: string | null;
  /** Controlled by the conversation view so the AI can drop a draft in here. */
  content: string;
  onContentChange: (content: string) => void;
}

/** Warn once under six hours are left — enough time to still do something. */
const WARN_BELOW_MS = 6 * 60 * 60 * 1000;

export function Composer({
  conversationId,
  channel,
  lastInboundAt,
  content,
  onContentChange,
}: ComposerProps) {
  const send = useSendMessage(conversationId);
  const remainingMs = replyWindowRemainingMs({ channel, lastInboundAt });

  if (!REPLYABLE_CHANNELS.includes(channel)) {
    return (
      <div className="border-t border-border bg-surface px-4 py-3">
        <p className="text-center text-xs text-muted-foreground">
          Instagram lead ads cannot receive replies. Reach out on WhatsApp instead.
        </p>
      </div>
    );
  }

  function submit() {
    const trimmed = content.trim();
    if (!trimmed || send.isPending) return;

    send.mutate(trimmed, {
      onSuccess: () => onContentChange(''),
      onError: (error) =>
        toast.error(
          error instanceof ApiError ? error.message : 'The message could not be sent. Try again.',
        ),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter starts a new line — as in WhatsApp Web.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <>
      {/* The provider refuses a free-form reply 24 hours after the customer's
          last message, so say so before the send fails rather than after. */}
      {remainingMs !== null && remainingMs < WARN_BELOW_MS ? (
        <p
          role="status"
          className={`flex items-center gap-2 border-t px-4 py-2 text-xs ${
            remainingMs === 0
              ? 'border-warning-border bg-warning-subtle text-warning-foreground'
              : 'border-info-border bg-info-subtle text-info-foreground'
          }`}
        >
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {remainingMs === 0
            ? 'The 24-hour reply window has closed. Replies are sent as a human-agent follow-up and may be rejected until the customer writes again.'
            : `${formatRemaining(remainingMs)} left to reply freely on ${CHANNEL_NAMES[channel]}.`}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-border bg-surface px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Textarea
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4096}
          placeholder="Type a message…"
          aria-label="Message"
          className="max-h-32 min-h-9 flex-1 resize-none py-1.5"
        />
        <Button type="submit" size="icon" loading={send.isPending} aria-label="Send message">
          <Send aria-hidden />
        </Button>
      </form>
    </>
  );
}

const CHANNEL_NAMES: Record<Channel, string> = {
  INSTAGRAM: 'Instagram',
  INSTAGRAM_LEAD: 'Instagram',
  WHATSAPP: 'WhatsApp',
};

function formatRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
