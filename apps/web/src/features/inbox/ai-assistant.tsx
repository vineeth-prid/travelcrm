'use client';

import { ApiError, type ExtractedDetails } from '@travel-crm/sdk';
import { Button, toast } from '@travel-crm/ui';
import { ClipboardList, MessageSquareQuote, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useExtractDetails, useSuggestReply, useSummarise } from './use-ai';

interface AiAssistantProps {
  conversationId: string;
  /** Fills the CRM form for review — never saves. */
  onExtracted: (details: ExtractedDetails) => void;
  /** Drops a draft into the composer — never sends. */
  onReplyDrafted: (reply: string) => void;
}

function friendlyError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'The AI assistant is unavailable right now. Please try again.';
}

export function AiAssistant({ conversationId, onExtracted, onReplyDrafted }: AiAssistantProps) {
  const [summary, setSummary] = useState<string | null>(null);

  const summarise = useSummarise(conversationId);
  const extract = useExtractDetails(conversationId);
  const reply = useSuggestReply(conversationId);

  // Summaries are generated on demand and never stored, so a different
  // conversation starts with a blank slate.
  useEffect(() => setSummary(null), [conversationId]);

  const busy = summarise.isPending || extract.isPending || reply.isPending;

  function countFilled(details: ExtractedDetails): number {
    return Object.values(details).filter((value) => value !== null).length;
  }

  return (
    <section aria-labelledby="ai-assistant">
      <h3
        id="ai-assistant"
        className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Sparkles className="size-3.5" aria-hidden />
        AI assistant
      </h3>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="justify-start"
          disabled={busy}
          loading={summarise.isPending}
          onClick={() =>
            summarise.mutate(undefined, {
              onSuccess: (result) => setSummary(result.summary),
              onError: (error) => toast.error(friendlyError(error)),
            })
          }
        >
          {summarise.isPending ? null : <Sparkles aria-hidden />}
          {summarise.isPending ? 'Generating…' : 'Summarize conversation'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="justify-start"
          disabled={busy}
          loading={extract.isPending}
          onClick={() =>
            extract.mutate(undefined, {
              onSuccess: (details) => {
                onExtracted(details);
                const filled = countFilled(details);
                toast.success(
                  filled === 0
                    ? 'Nothing could be extracted from this conversation yet.'
                    : `Filled ${filled} field${filled === 1 ? '' : 's'} — review, then click Save.`,
                );
              },
              onError: (error) => toast.error(friendlyError(error)),
            })
          }
        >
          {extract.isPending ? null : <ClipboardList aria-hidden />}
          {extract.isPending ? 'Generating…' : 'Extract travel details'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="justify-start"
          disabled={busy}
          loading={reply.isPending}
          onClick={() =>
            reply.mutate(undefined, {
              // The confirmation is shown beside the composer, where the draft
              // actually lands, rather than as a toast.
              onSuccess: (result) => onReplyDrafted(result.reply),
              onError: (error) => toast.error(friendlyError(error)),
            })
          }
        >
          {reply.isPending ? null : <MessageSquareQuote aria-hidden />}
          {reply.isPending ? 'Generating…' : 'Suggest reply'}
        </Button>
      </div>

      {summary ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Summary</p>
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Dismiss summary"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
        </div>
      ) : null}
    </section>
  );
}
