'use client';

import { useQuery } from '@tanstack/react-query';
import type { CustomerQuery } from '@travel-crm/sdk';
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
import { UserSquare2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatMoney } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/**
 * The customer book.
 *
 * There is no "new customer" button: a customer is created by the lead they
 * came in on, so making one here would produce a record with no enquiry behind
 * it. What this view is for is the question a consultant actually asks —
 * "have we dealt with these people before, and how did it go?"
 */
export function CustomersWorkspace() {
  const [query, setQuery] = useState<CustomerQuery>({});

  const customers = useQuery({
    queryKey: queryKeys.customers(query),
    queryFn: ({ signal }) => api.customers.list(query, signal),
    placeholderData: (previous) => previous,
  });

  return (
    <PageContainer
      width="full"
      title="Customers"
      description="Everybody who has ever enquired, and what came of it."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            className="min-w-64 flex-1"
            placeholder="Name, destination, email, phone or city"
            value={query.search ?? ''}
            onChange={(event) =>
              setQuery((current) => ({ ...current, search: event.target.value || undefined }))
            }
          />
          <Button
            size="sm"
            variant={query.repeatOnly ? 'primary' : 'secondary'}
            aria-pressed={Boolean(query.repeatOnly)}
            onClick={() =>
              setQuery((current) => ({
                ...current,
                repeatOnly: current.repeatOnly ? undefined : true,
              }))
            }
          >
            Repeat customers only
          </Button>
        </div>

        <Card>
          {customers.isPending ? (
            <LoadingState label="Loading customers…" />
          ) : customers.isError ? (
            <EmptyState
              icon={<UserSquare2 aria-hidden />}
              title="Could not load customers"
              action={
                <Button variant="secondary" onClick={() => void customers.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : customers.data.length === 0 ? (
            <EmptyState
              icon={<UserSquare2 aria-hidden />}
              title="Nobody here yet"
              description="Customers appear as soon as their first lead is created."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Enquiries</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.data.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {customer.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {[customer.phone, customer.email, customer.city]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {customer.destinations.map((destination) => (
                          <Badge key={destination} variant="neutral">
                            {destination}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.leadCount > 1 ? (
                        <Badge variant="secondary">{customer.leadCount} — repeat</Badge>
                      ) : (
                        customer.leadCount
                      )}
                    </TableCell>
                    <TableCell className="text-right">{customer.wonCount}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMoney(customer.invoicedAmount, customer.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatMoney(customer.collectedAmount, customer.currency)}
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
