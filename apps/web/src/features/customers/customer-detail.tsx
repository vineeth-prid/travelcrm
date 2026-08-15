'use client';

import { useQuery } from '@tanstack/react-query';
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
  Tabs,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';
import { UserSquare2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { FollowUpList } from '@/features/follow-ups/follow-up-list';
import { INVOICE_STATUS_LABELS } from '@/features/invoices/invoice-labels';
import { formatDay, formatMoney, STAGE_LABELS } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** The customer's journey, in the order it happened. */
const TABS = [
  { id: 'leads', label: 'Enquiries' },
  { id: 'follow-ups', label: 'Follow-ups' },
  { id: 'invoices', label: 'Invoices' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CustomerDetail({ customerId }: { customerId: string }) {
  const [tab, setTab] = useState<TabId>('leads');

  const detail = useQuery({
    queryKey: queryKeys.customer(customerId),
    queryFn: ({ signal }) => api.customers.get(customerId, signal),
  });

  if (detail.isPending) {
    return (
      <PageContainer title="Customer">
        <LoadingState label="Loading customer…" />
      </PageContainer>
    );
  }

  if (detail.isError) {
    return (
      <PageContainer title="Customer">
        <EmptyState
          icon={<UserSquare2 aria-hidden />}
          title="That customer is not on your list"
          description="It may belong to a colleague's lead."
          action={
            <Button asChild variant="secondary">
              <Link href="/customers">Back to customers</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const { customer, leads, invoices } = detail.data;

  return (
    <PageContainer
      width="full"
      title={customer.name}
      description={[customer.phone, customer.email, customer.city, customer.country]
        .filter(Boolean)
        .join(' · ')}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Enquiries" value={String(customer.leadCount)} />
          <Figure label="Booked" value={String(customer.wonCount)} />
          <Figure
            label="Invoiced"
            value={formatMoney(customer.invoicedAmount, customer.currency)}
          />
          <Figure
            label="Collected"
            value={formatMoney(customer.collectedAmount, customer.currency)}
          />
        </div>

        {/* Same tabs as a lead, in the same order, so the two pages read alike. */}
        <Tabs
          aria-label="Customer sections"
          items={TABS}
          value={tab}
          onValueChange={(next) => setTab(next as TabId)}
        />

        <Card hidden={tab !== 'leads'}>
          <CardHeader>
            <CardTitle>Enquiries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Raised</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-mono text-sm text-foreground hover:text-primary"
                      >
                        {lead.reference}
                      </Link>
                    </TableCell>
                    <TableCell>{lead.destination ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{STAGE_LABELS[lead.stage]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {lead.assignedTo?.name ?? 'Unassigned'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card hidden={tab !== 'invoices'}>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                Nothing has been billed to this customer yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono text-sm">{invoice.reference}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDay(invoice.issueDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(invoice.totalAmount, invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(invoice.amountPaid, invoice.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card hidden={tab !== 'follow-ups'}>
          <CardHeader>
            <CardTitle>Follow-ups</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
             * Across every enquiry this customer has made, so a repeat
             * customer's chases are in one place rather than split by lead.
             */}
            <CustomerFollowUps leadIds={leads.map((lead) => lead.id)} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

/** Every follow-up across a customer's leads, soonest first. */
function CustomerFollowUps({ leadIds }: { leadIds: string[] }) {
  const followUps = useQuery({
    queryKey: queryKeys.followUps({ leadIds: leadIds.join(',') }),
    enabled: leadIds.length > 0,
    queryFn: async ({ signal }) => {
      const perLead = await Promise.all(
        leadIds.map((leadId) => api.followUps.list({ leadId }, signal)),
      );
      return perLead.flat().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },
  });

  if (leadIds.length === 0) return <p className="text-sm text-muted-foreground">No enquiries.</p>;
  if (followUps.isPending) return <LoadingState label="Loading follow-ups…" />;
  if (followUps.isError) {
    return <p className="text-sm text-muted-foreground">The follow-ups could not be loaded.</p>;
  }

  return <FollowUpList followUps={followUps.data} />;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-xl font-semibold text-foreground">{value}</p>
    </Card>
  );
}
