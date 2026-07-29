'use client';

import { ApiError, QUOTE_SENDABLE_CHANNELS, type Conversation, type Quote } from '@travel-crm/sdk';
import { Badge, Button, Skeleton, toast } from '@travel-crm/ui';
import { ExternalLink, FileText, Pencil, Plus, Send } from 'lucide-react';
import { useState } from 'react';

import { api } from '@/lib/api';
import { formatMoney, formatShortDate } from './money';
import { QuoteEditor } from './quote-editor';
import { useGeneratePdf, useQuotes, useSendQuote } from './use-quotes';

const LEAD_NOTICE =
  "Instagram Lead Ads don't support file replies. Please continue the conversation on WhatsApp.";

function friendlyError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

/**
 * Opens a PDF in a new tab. The tab is opened synchronously, before the link is
 * fetched, so the browser does not treat it as a pop-up.
 */
async function openPdf(quoteId: string): Promise<void> {
  const tab = window.open('', '_blank');

  try {
    const { pdfUrl } = await api.quotes.get(quoteId);
    if (!pdfUrl) throw new Error('no pdf');
    if (tab) tab.location.href = pdfUrl;
    else window.location.href = pdfUrl;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function QuotesSection({ conversation }: { conversation: Conversation }) {
  const quotes = useQuotes(conversation.id);
  const generate = useGeneratePdf(conversation.id);
  const send = useSendQuote(conversation.id);

  const [editing, setEditing] = useState<{ quote: Quote | null; asNewVersion: boolean } | null>(
    null,
  );

  const canSend = QUOTE_SENDABLE_CHANNELS.includes(conversation.channel);
  const latest = quotes.data?.[0];
  const history = quotes.data?.slice(1) ?? [];
  const busy = generate.isPending || send.isPending;

  return (
    <section aria-labelledby="quotes">
      <div className="mb-2 flex items-center justify-between">
        <h3
          id="quotes"
          className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Quotes
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing({ quote: null, asNewVersion: false })}
        >
          <Plus aria-hidden />
          New quote
        </Button>
      </div>

      {quotes.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : quotes.isError ? (
        <p className="text-sm text-muted-foreground">Quotes could not be loaded.</p>
      ) : !latest ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No quotes yet. Create one once you know what the customer needs.
        </p>
      ) : (
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Version {latest.version}</p>
            <Badge variant={latest.status === 'SENT' ? 'success' : 'neutral'}>
              {latest.status === 'SENT' ? 'Sent' : 'Draft'}
            </Badge>
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">{latest.title}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {formatMoney(latest.currency, latest.totalAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            Valid until {formatShortDate(latest.validUntil)}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="justify-start"
              disabled={busy}
              onClick={() => setEditing({ quote: latest, asNewVersion: latest.status === 'SENT' })}
            >
              <Pencil aria-hidden />
              {latest.status === 'SENT' ? 'Edit as new version' : 'Edit'}
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="justify-start"
              disabled={busy || latest.status === 'SENT'}
              loading={generate.isPending}
              onClick={() =>
                generate.mutate(latest.id, {
                  onSuccess: () => toast.success('PDF generated'),
                  onError: (error) => toast.error(friendlyError(error)),
                })
              }
            >
              <FileText aria-hidden />
              {generate.isPending ? 'Generating…' : 'Generate PDF'}
            </Button>

            {latest.hasPdf ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="justify-start"
                onClick={() => {
                  void openPdf(latest.id).catch(() =>
                    toast.error('The PDF could not be opened. Try generating it again.'),
                  );
                }}
              >
                <ExternalLink aria-hidden />
                Open PDF
              </Button>
            ) : null}

            <Button
              type="button"
              size="sm"
              className="justify-start"
              disabled={busy || !canSend || !latest.hasPdf || latest.status === 'SENT'}
              loading={send.isPending}
              title={canSend ? undefined : LEAD_NOTICE}
              onClick={() =>
                send.mutate(latest.id, {
                  onSuccess: () => toast.success('Quote sent to the customer'),
                  onError: (error) => toast.error(friendlyError(error)),
                })
              }
            >
              <Send aria-hidden />
              {send.isPending ? 'Sending…' : 'Send quote'}
            </Button>

            {!canSend ? (
              <p className="text-xs leading-relaxed text-warning-foreground">{LEAD_NOTICE}</p>
            ) : !latest.hasPdf ? (
              <p className="text-xs text-muted-foreground">Generate the PDF before sending.</p>
            ) : null}
          </div>
        </div>
      )}

      {history.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            History
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {history.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-xs font-medium">Version {quote.version}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatMoney(quote.currency, quote.totalAmount)}
                    {quote.sentAt ? ` · ${formatShortDate(quote.sentAt)}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Badge variant={quote.status === 'SENT' ? 'success' : 'neutral'}>
                    {quote.status === 'SENT' ? 'Sent' : 'Draft'}
                  </Badge>
                  {quote.hasPdf ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Open the PDF for version ${quote.version}`}
                      onClick={() => {
                        void openPdf(quote.id).catch(() =>
                          toast.error('The PDF could not be opened.'),
                        );
                      }}
                    >
                      <ExternalLink aria-hidden />
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {editing ? (
        <QuoteEditor
          open
          onOpenChange={(open) => !open && setEditing(null)}
          conversationId={conversation.id}
          quote={editing.quote}
          asNewVersion={editing.asNewVersion}
        />
      ) : null}
    </section>
  );
}
