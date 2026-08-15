'use client';

import type { InvoiceQuery, PaymentStatus } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageContainer,
  SearchBox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';
import { Receipt } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_VARIANTS,
} from './invoice-labels';
import { useInvoices } from './use-invoices';

const VIEWS: { label: string; paymentStatus?: PaymentStatus }[] = [
  { label: 'All' },
  { label: 'Overdue', paymentStatus: 'OVERDUE' },
  { label: 'Part paid', paymentStatus: 'PARTIALLY_PAID' },
  { label: 'Unpaid', paymentStatus: 'UNPAID' },
  { label: 'Paid', paymentStatus: 'PAID' },
];

export function InvoicesWorkspace() {
  const [view, setView] = useState(0);
  const [search, setSearch] = useState('');

  const query: InvoiceQuery = {
    ...(VIEWS[view]!.paymentStatus ? { paymentStatus: VIEWS[view]!.paymentStatus } : {}),
    ...(search ? { search } : {}),
  };

  const invoices = useInvoices(query);

  const totals = (invoices.data ?? []).reduce(
    (sum, invoice) => ({
      billed: sum.billed + invoice.totals.totalAmount,
      collected: sum.collected + invoice.amountPaid,
      outstanding: sum.outstanding + invoice.outstanding,
    }),
    { billed: 0, collected: 0, outstanding: 0 },
  );

  // Only meaningful when everything on screen is in one currency, which is the
  // normal case; showing a mixed-currency sum would be worse than showing none.
  const currencies = new Set((invoices.data ?? []).map((invoice) => invoice.currency));
  const singleCurrency = currencies.size === 1 ? [...currencies][0]! : null;

  return (
    <PageContainer
      width="full"
      title="Invoices"
      description="What has been billed, what has been collected, and what is still owed."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {VIEWS.map((item, index) => (
              <Button
                key={item.label}
                variant={index === view ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={index === view}
                onClick={() => setView(index)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <SearchBox
            className="sm:ml-auto sm:max-w-xs"
            placeholder="Reference, customer or package…"
            aria-label="Search invoices"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {singleCurrency && (invoices.data?.length ?? 0) > 0 ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Summary label="Billed" value={formatMoney(totals.billed, singleCurrency)} />
            <Summary label="Collected" value={formatMoney(totals.collected, singleCurrency)} />
            <Summary
              label="Outstanding"
              value={formatMoney(totals.outstanding, singleCurrency)}
              accent
            />
          </div>
        ) : null}

        <Card>
          {invoices.isPending ? (
            <LoadingState label="Loading invoices…" />
          ) : invoices.isError ? (
            <EmptyState icon={<Receipt aria-hidden />} title="Could not load invoices" />
          ) : invoices.data.length === 0 ? (
            <EmptyState
              icon={<Receipt aria-hidden />}
              title="Nothing here"
              description="Invoices are raised from a lead once the customer is ready to proceed."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.data.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      {/* The invoice, not its lead: somebody who clicked an
                          invoice reference wants the document. */}
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {invoice.reference}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {invoice.packageTitle}
                      </span>
                    </TableCell>
                    <TableCell>{invoice.billingName}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDay(invoice.dueDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="neutral">{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                        {invoice.status === 'CANCELLED' ? null : (
                          <Badge variant={PAYMENT_STATUS_VARIANTS[invoice.paymentStatus]}>
                            {PAYMENT_STATUS_LABELS[invoice.paymentStatus]}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(invoice.totals.totalAmount, invoice.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(invoice.outstanding, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}

function Summary({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? 'border-accent-border bg-accent-subtle p-4' : 'p-4'}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}
