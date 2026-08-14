'use client';

import type { LeadQuery } from '@travel-crm/sdk';
import { Button, Card, EmptyState, LoadingState, Pagination, PageContainer } from '@travel-crm/ui';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useSession } from '@/features/auth/session-context';
import { LeadFilters } from './lead-filters';
import { LeadTable } from './lead-table';
import { useLeads, useStaff } from './use-leads';

const PAGE_SIZE = 25;

export function LeadsWorkspace() {
  const user = useSession();
  const [query, setQuery] = useState<LeadQuery>({ page: 1, pageSize: PAGE_SIZE });

  const leads = useLeads(query);
  const staff = useStaff();

  /** Any filter change returns to page 1 — page 4 of the old result is meaningless. */
  const patch = (next: Partial<LeadQuery>) =>
    setQuery((current) => ({ ...current, ...next, page: 1 }));

  return (
    <PageContainer
      width="full"
      title="Leads"
      description="Every enquiry, from first contact to a booked trip."
      actions={
        <Button asChild>
          <Link href="/leads/new">
            <Plus aria-hidden />
            New lead
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <LeadFilters
          query={query}
          onChange={patch}
          onReset={() => setQuery({ page: 1, pageSize: PAGE_SIZE })}
          staff={staff.data ?? []}
          showAssignee={user.role === 'ADMIN'}
        />

        <Card>
          {leads.isPending ? (
            <LoadingState label="Loading leads…" />
          ) : leads.isError ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="Could not load leads"
              description="The server did not respond. Check your connection and try again."
              action={
                <Button variant="secondary" onClick={() => void leads.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : leads.data.leads.length === 0 ? (
            <EmptyState
              icon={<Users aria-hidden />}
              title="No leads match"
              description="Adjust the filters, or create the first lead for this enquiry."
              action={
                <Button asChild>
                  <Link href="/leads/new">New lead</Link>
                </Button>
              }
            />
          ) : (
            <>
              <LeadTable leads={leads.data.leads} />
              <div className="border-t border-border px-4 py-3">
                <Pagination
                  page={leads.data.page}
                  pageSize={leads.data.pageSize}
                  total={leads.data.total}
                  onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
