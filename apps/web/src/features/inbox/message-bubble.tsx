import type { Message } from '@travel-crm/sdk';
import { cn } from '@travel-crm/ui';
import { Check, CheckCheck } from 'lucide-react';

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function MessageBubble({ message }: { message: Message }) {
  const outgoing = message.direction === 'OUTGOING';
  const isLead = message.messageType === 'LEAD';

  return (
    <li className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(36rem,80%)] rounded-xl px-3 py-2 text-sm shadow-sm',
          outgoing
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : isLead
              ? 'rounded-bl-sm border border-warning-border bg-warning-subtle text-foreground'
              : 'rounded-bl-sm border border-border bg-surface text-foreground',
        )}
      >
        {isLead ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning-foreground">
            Lead ad submission
          </p>
        ) : null}

        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        <p
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[10px]',
            outgoing ? 'text-primary-foreground/75' : 'text-muted-foreground',
          )}
        >
          <time dateTime={message.sentAt}>{clockTime(message.sentAt)}</time>
          {outgoing ? (
            message.deliveredAt ? (
              <CheckCheck className="size-3" aria-label="Delivered" />
            ) : (
              <Check className="size-3" aria-label="Sent" />
            )
          ) : null}
        </p>
      </div>
    </li>
  );
}
