'use client';

import { useQuery } from '@tanstack/react-query';
import { PAYMENT_METHODS, type PaymentQuery } from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
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
import { CreditCard } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { PAYMENT_METHOD_LABELS } from './invoice-labels';

/**
 * The payment ledger: money received, newest first, across every invoice.
 *
 * Totals are shown for the rows on screen rather than for all time, because a
 * filtered total that silently includes rows you filtered out is worse than no
 * total at all.
 */
export function PaymentsWorkspace() {
  const [query, setQuery] = useState<PaymentQuery>({});

  const payments = useQuery({
    queryKey: queryKeys.payments(query),
    queryFn: ({ signal }) => api.payments.list(query, signal),
    placeholderData: (previous) => previous,
  });

  const rows = payments.data ?? [];
  const currency = rows[0]?.currency ?? 'INR';
  const total = rows
    .filter((row) => row.currency === currency)
    .reduce((sum, row) => sum + row.amount, 0);

  const patch = (next: Partial<PaymentQuery>) => setQuery((current) => ({ ...current, ...next }));

  return (
    <PageContainer width="full" title="Payments" description="Every receipt against every invoice.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <SearchBox
            className="min-w-56 flex-1 sm:max-w-xs"
            placeholder="Receipt, invoice, customer or bank reference"
            aria-label="Search payments"
            value={query.search ?? ''}
            onChange={(event) => patch({ search: event.target.value || undefined })}
          />
          <FormField id="payments-from" label="From" className="w-40">
            <Input
              id="payments-from"
              type="date"
              value={query.from ?? ''}
              max={query.to || undefined}
              onChange={(event) => patch({ from: event.target.value || undefined })}
            />
          </FormField>
          <FormField id="payments-to" label="To" className="w-40">
            <Input
              id="payments-to"
              type="date"
              value={query.to ?? ''}
              min={query.from || undefined}
              onChange={(event) => patch({ to: event.target.value || undefined })}
            />
          </FormField>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant={query.method ? 'secondary' : 'primary'}
              onClick={() => patch({ method: undefined })}
            >
              Any method
            </Button>
            {PAYMENT_METHODS.map((method) => (
              <Button
                key={method}
                size="sm"
                variant={query.method === method ? 'primary' : 'secondary'}
                aria-pressed={query.method === method}
                onClick={() => patch({ method })}
              >
                {PAYMENT_METHOD_LABELS[method]}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          {payments.isPending ? (
            <LoadingState label="Loading payments…" />
          ) : payments.isError ? (
            <EmptyState
              icon={<CreditCard aria-hidden />}
              title="Could not load payments"
              action={
                <Button variant="secondary" onClick={() => void payments.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<CreditCard aria-hidden />}
              title="No payments match"
              description="Payments are recorded against an issued invoice."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono text-sm">{payment.reference}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDay(payment.paidAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link
                          href={`/leads/${payment.leadId}`}
                          className="text-foreground hover:text-primary"
                        >
                          {payment.customerName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{payment.invoiceReference}</span>
                        <span className="block text-xs text-muted-foreground">
                          of {formatMoney(payment.invoiceTotal, payment.currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{PAYMENT_METHOD_LABELS[payment.method]}</Badge>
                        {payment.externalReference ? (
                          <span className="block text-xs text-muted-foreground">
                            {payment.externalReference}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payment.recordedBy?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {formatMoney(payment.amount, payment.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between border-t border-border px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {rows.length} payment{rows.length === 1 ? '' : 's'} shown
                </span>
                <span className="font-mono text-sm font-medium text-foreground">
                  {formatMoney(total, currency)}
                </span>
              </div>
            </>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
