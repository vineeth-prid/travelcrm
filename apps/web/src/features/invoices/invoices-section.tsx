'use client';

import type { Invoice, Lead } from '@travel-crm/sdk';
import { Badge, Button, EmptyState, LoadingState, toast } from '@travel-crm/ui';
import { Ban, Download, FileCheck, Plus, Receipt, Wallet } from 'lucide-react';
import { useState } from 'react';

import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { useLeadProposals } from '@/features/proposals/use-proposals';
import { InvoiceForm } from './invoice-form';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
} from './invoice-labels';
import { PaymentDialog } from './payment-dialog';
import {
  useCancelInvoice,
  useGenerateInvoicePdf,
  useInvoices,
  useIssueInvoice,
} from './use-invoices';

/** Invoices raised against one lead, on its detail page. */
export function InvoicesSection({
  lead,
  billFromProposalId = null,
}: {
  lead: Lead;
  /** Set when the consultant arrived from a proposal's "Raise invoice". */
  billFromProposalId?: string | null;
}) {
  const invoices = useInvoices({ leadId: lead.id });
  const proposals = useLeadProposals(lead.id);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(billFromProposalId !== null);

  // The proposal named in the URL wins; otherwise the accepted one, which is
  // the normal path; otherwise the most recent, so the form is never empty
  // when a proposal exists. A proposal already billed is not offered again.
  const billable = (proposals.data ?? []).filter((proposal) => !proposal.isInvoiced);
  const acceptedProposal =
    billable.find((proposal) => proposal.id === billFromProposalId) ??
    billable.find((proposal) => proposal.status === 'ACCEPTED') ??
    billable[0] ??
    null;

  if (creating || editing) {
    return (
      <InvoiceForm
        lead={lead}
        proposal={editing ? null : acceptedProposal}
        invoice={editing}
        onDone={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  if (invoices.isPending) return <LoadingState label="Loading invoices…" />;

  if (invoices.isError) {
    return <EmptyState icon={<Receipt aria-hidden />} title="Could not load invoices" />;
  }

  if (invoices.data.length === 0) {
    return (
      <EmptyState
        icon={<Receipt aria-hidden />}
        title="No invoices yet"
        description="Raise one when the customer is ready to proceed. Their details carry over — no second customer record is created."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Raise invoice
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {invoices.data.map((invoice) => (
        <InvoiceCard key={invoice.id} invoice={invoice} onEdit={() => setEditing(invoice)} />
      ))}

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          Raise invoice
        </Button>
      </div>
    </div>
  );
}

function InvoiceCard({ invoice, onEdit }: { invoice: Invoice; onEdit: () => void }) {
  const generate = useGenerateInvoicePdf(invoice.leadId, invoice.id);
  const issue = useIssueInvoice(invoice.leadId, invoice.id);
  const cancel = useCancelInvoice(invoice.leadId, invoice.id);
  const [paying, setPaying] = useState(false);

  const openPdf = async () => {
    try {
      const result = await generate.mutateAsync();
      if (result.pdfUrl) window.open(result.pdfUrl, '_blank', 'noopener');
    } catch {
      toast.error('The PDF could not be produced.');
    }
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not work.');
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{invoice.packageTitle}</p>
          <p className="text-xs text-muted-foreground">
            {invoice.reference} · issued {formatDay(invoice.issueDate)} · due{' '}
            {formatDay(invoice.dueDate)}
          </p>
        </div>

        <Badge variant="neutral">{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
        {invoice.status === 'CANCELLED' ? null : (
          <Badge variant={PAYMENT_STATUS_VARIANTS[invoice.paymentStatus]}>
            {PAYMENT_STATUS_LABELS[invoice.paymentStatus]}
          </Badge>
        )}
        <Badge variant="accent">{formatMoney(invoice.totals.totalAmount, invoice.currency)}</Badge>
      </div>

      {invoice.status !== 'CANCELLED' ? (
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3 text-sm">
          <Figure label="Total" value={formatMoney(invoice.totals.totalAmount, invoice.currency)} />
          <Figure label="Paid" value={formatMoney(invoice.amountPaid, invoice.currency)} />
          <Figure
            label="Outstanding"
            value={formatMoney(invoice.outstanding, invoice.currency)}
            emphasis={invoice.outstanding > 0}
          />
        </dl>
      ) : null}

      {invoice.payments.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-4">
              <span>
                {formatDay(payment.paidAt)} · {PAYMENT_METHOD_LABELS[payment.method]}
                {payment.externalReference ? ` · ${payment.externalReference}` : ''}
                {payment.recordedBy ? ` · ${payment.recordedBy.name}` : ''}
              </span>
              <span className="tabular-nums">{formatMoney(payment.amount, invoice.currency)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {invoice.status === 'DRAFT' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={cancel.isPending}
              onClick={() => void run(() => cancel.mutateAsync(), 'Invoice cancelled')}
            >
              <Ban aria-hidden />
              Cancel
            </Button>
          </>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          loading={generate.isPending}
          onClick={() => void openPdf()}
        >
          <Download aria-hidden />
          {invoice.hasPdf ? 'View PDF' : 'Generate PDF'}
        </Button>

        {invoice.status === 'DRAFT' ? (
          <Button
            size="sm"
            loading={issue.isPending}
            onClick={() => void run(() => issue.mutateAsync(), 'Invoice issued')}
          >
            <FileCheck aria-hidden />
            Issue
          </Button>
        ) : null}

        {invoice.status === 'ISSUED' && invoice.outstanding > 0 ? (
          <Button size="sm" onClick={() => setPaying(true)}>
            <Wallet aria-hidden />
            Record payment
          </Button>
        ) : null}
      </div>

      <PaymentDialog invoice={invoice} open={paying} onClose={() => setPaying(false)} />
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? 'mt-0.5 text-sm font-semibold tabular-nums text-foreground'
            : 'mt-0.5 text-sm tabular-nums text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  );
}
