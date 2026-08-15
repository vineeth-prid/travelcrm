'use client';

import { useQuery } from '@tanstack/react-query';
import type { Invoice } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
  PageContainer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@travel-crm/ui';
import { CalendarPlus, Download, Link2, Pencil, Receipt, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ScheduleDialog } from '@/features/follow-ups/schedule-dialog';
import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { useLead } from '@/features/leads/use-leads';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { InvoiceForm } from './invoice-form';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
} from './invoice-labels';
import { PaymentDialog } from './payment-dialog';
import { useGenerateInvoicePdf } from './use-invoices';

/**
 * One invoice, on its own page.
 *
 * Reached from the Invoices list, which used to send you to the lead — three
 * clicks and a scroll away from the document you were looking at. Everything
 * you can do to an invoice is here: revise it, download it, share the link,
 * record a payment, chase it.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const invoice = useQuery({
    queryKey: queryKeys.invoice(invoiceId),
    queryFn: ({ signal }) => api.invoices.get(invoiceId, signal),
  });

  if (invoice.isPending) {
    return (
      <PageContainer title="Invoice">
        <LoadingState label="Loading invoice…" />
      </PageContainer>
    );
  }

  if (invoice.isError) {
    return (
      <PageContainer title="Invoice">
        <EmptyState
          icon={<Receipt aria-hidden />}
          title="That invoice is not available"
          description="It may have been removed, or it may belong to a colleague's lead."
          action={
            <Button asChild variant="secondary">
              <Link href="/invoices">Back to invoices</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return <LoadedInvoice invoice={invoice.data} />;
}

function LoadedInvoice({ invoice }: { invoice: Invoice }) {
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const generate = useGenerateInvoicePdf(invoice.leadId, invoice.id);
  const isDraft = invoice.status === 'DRAFT';

  // Only needed to revise: the form edits an invoice in the context of its
  // lead, and a draft is the only thing that can be edited at all.
  const lead = useLead(invoice.leadId);

  /** Renders the PDF if it does not exist yet, then opens it. */
  const openPdf = async () => {
    try {
      const result = await generate.mutateAsync();
      if (!result.pdfUrl) {
        toast.error('The document could not be produced.');
        return;
      }
      window.open(result.pdfUrl, '_blank', 'noopener');
    } catch {
      toast.error('The document could not be produced.');
    }
  };

  /**
   * Copies a link to the stored PDF. Deliberately not "send": what goes to a
   * customer, over which channel, is the consultant's decision.
   */
  const share = async () => {
    try {
      const result = await generate.mutateAsync();
      if (!result.pdfUrl) {
        toast.error('There is no document to share yet.');
        return;
      }
      await navigator.clipboard.writeText(result.pdfUrl);
      toast.success('Link copied. It is time-limited.');
    } catch {
      toast.error('The link could not be copied.');
    }
  };

  if (editing && lead.data) {
    return (
      <PageContainer width="full" title={`Revise ${invoice.reference}`}>
        <InvoiceForm
          lead={lead.data}
          proposal={null}
          invoice={invoice}
          onDone={() => setEditing(false)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      width="full"
      title={invoice.reference}
      description={`${invoice.billingName} · issued ${formatDay(invoice.issueDate)} · due ${formatDay(invoice.dueDate)}`}
      actions={
        <>
          <Button variant="secondary" onClick={() => setScheduling(true)}>
            <CalendarPlus aria-hidden />
            Record follow-up
          </Button>
          <Button variant="secondary" loading={generate.isPending} onClick={() => void share()}>
            <Link2 aria-hidden />
            Share link
          </Button>
          <Button variant="secondary" loading={generate.isPending} onClick={() => void openPdf()}>
            <Download aria-hidden />
            Download
          </Button>
          {isDraft ? (
            <Button onClick={() => setEditing(true)}>
              <Pencil aria-hidden />
              Revise
            </Button>
          ) : (
            <Button onClick={() => setPaying(true)} disabled={invoice.outstanding <= 0}>
              <Send aria-hidden />
              Record payment
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{invoice.packageTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Row label="Destination" value={invoice.destination ?? '—'} />
                <Row
                  label="Travel"
                  value={
                    invoice.travelStart || invoice.travelEnd
                      ? `${formatDay(invoice.travelStart)} → ${formatDay(invoice.travelEnd)}`
                      : '—'
                  }
                />
                <Row
                  label="Package"
                  value={formatMoney(invoice.totals.packageAmount, invoice.currency)}
                />
                <Row
                  label="Discount"
                  value={formatMoney(invoice.totals.discountAmount, invoice.currency)}
                />
                <Row label="Tax" value={formatMoney(invoice.totals.taxAmount, invoice.currency)} />
                <Row
                  label="Total"
                  value={formatMoney(invoice.totals.totalAmount, invoice.currency)}
                  strong
                />
              </dl>

              {invoice.description ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {invoice.description}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {invoice.payments.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  Nothing received against this invoice yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Recorded by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-sm">{payment.reference}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDay(payment.paidAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="neutral">{PAYMENT_METHOD_LABELS[payment.method]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {payment.recordedBy?.name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatMoney(payment.amount, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-3">
                <Row label="Invoice" value={INVOICE_STATUS_LABELS[invoice.status]} />
                <Row label="Payment">
                  <Badge variant={PAYMENT_STATUS_VARIANTS[invoice.paymentStatus]}>
                    {PAYMENT_STATUS_LABELS[invoice.paymentStatus]}
                  </Badge>
                </Row>
                <Row label="Paid" value={formatMoney(invoice.amountPaid, invoice.currency)} />
                <Row
                  label="Outstanding"
                  value={formatMoney(invoice.outstanding, invoice.currency)}
                  strong
                />
              </dl>

              <Button asChild variant="secondary" size="sm">
                <Link href={`/leads/${invoice.leadId}`}>Open the lead</Link>
              </Button>
            </CardContent>
          </Card>

          {invoice.paymentTerms ? (
            <Card>
              <CardHeader>
                <CardTitle>Payment terms</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {invoice.paymentTerms}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <PaymentDialog invoice={invoice} open={paying} onClose={() => setPaying(false)} />
      <ScheduleDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        subject={{ invoiceId: invoice.id }}
        subjectLabel={invoice.reference}
      />
    </PageContainer>
  );
}

function Row({
  label,
  value,
  children,
  strong,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-mono text-sm font-semibold' : 'font-mono text-sm'}>
        {children ?? value}
      </dd>
    </div>
  );
}
