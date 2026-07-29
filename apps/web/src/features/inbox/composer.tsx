'use client';

import { ApiError, REPLYABLE_CHANNELS, type Channel } from '@travel-crm/sdk';
import { Button, Textarea, toast } from '@travel-crm/ui';
import { Send } from 'lucide-react';
import type { KeyboardEvent } from 'react';

import { useSendMessage } from './use-inbox';

interface ComposerProps {
  conversationId: string;
  channel: Channel;
  /** Controlled by the conversation view so the AI can drop a draft in here. */
  content: string;
  onContentChange: (content: string) => void;
}

export function Composer({ conversationId, channel, content, onContentChange }: ComposerProps) {
  const send = useSendMessage(conversationId);

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
  );
}
