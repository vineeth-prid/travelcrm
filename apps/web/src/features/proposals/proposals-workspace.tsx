'use client';

import { useQuery } from '@tanstack/react-query';
import { PROPOSAL_STATUSES, type ProposalQuery } from '@travel-crm/sdk';
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
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_VARIANTS } from './proposal-labels';

/**
 * Every proposal, across every lead.
 *
 * Margin is shown per row only where the viewer is entitled to it — the API
 * sends `financials: null` otherwise, so there is no number here to hide.
 */
export function ProposalsWorkspace() {
  const [query, setQuery] = useState<ProposalQuery>({});

  const proposals = useQuery({
    queryKey: queryKeys.proposals(query),
    queryFn: ({ signal }) => api.proposals.list(query, signal),
    placeholderData: (previous) => previous,
  });

  const showMargin = proposals.data?.some((row) => row.currentVersion.financials !== null) ?? false;

  return (
    <PageContainer
      width="full"
      title="Proposals"
      description="What has been quoted, what is out with a customer, and what came back."
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            className="min-w-64 flex-1 sm:max-w-xs"
            placeholder="Reference, customer or title"
            aria-label="Search proposals"
            value={query.search ?? ''}
            onChange={(event) =>
              setQuery((current) => ({ ...current, search: event.target.value || undefined }))
            }
          />
          <Button
            size="sm"
            variant={query.status ? 'secondary' : 'primary'}
            onClick={() => setQuery((current) => ({ ...current, status: undefined }))}
          >
            All
          </Button>
          {PROPOSAL_STATUSES.map((status) => (
            <Button
              key={status}
              size="sm"
              variant={query.status === status ? 'primary' : 'secondary'}
              aria-pressed={query.status === status}
              onClick={() => setQuery((current) => ({ ...current, status }))}
            >
              {PROPOSAL_STATUS_LABELS[status]}
            </Button>
          ))}
        </div>

        <Card>
          {proposals.isPending ? (
            <LoadingState label="Loading proposals…" />
          ) : proposals.isError ? (
            <EmptyState
              icon={<FileText aria-hidden />}
              title="Could not load proposals"
              action={
                <Button variant="secondary" onClick={() => void proposals.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : proposals.data.length === 0 ? (
            <EmptyState
              icon={<FileText aria-hidden />}
              title="No proposals match"
              description="Proposals are created from a lead, on the lead's own page."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  {showMargin ? <TableHead className="text-right">Margin</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.data.map((proposal) => {
                  const version = proposal.currentVersion;

                  return (
                    <TableRow key={proposal.id}>
                      <TableCell>
                        <Link
                          href={`/proposals/${proposal.id}`}
                          className="font-mono text-sm text-foreground hover:text-primary"
                        >
                          {proposal.reference}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          v{version.version}
                          {proposal.versionCount > 1 ? ` of ${proposal.versionCount}` : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-foreground">{proposal.customerName}</span>
                        <Link
                          href={`/leads/${proposal.leadId}`}
                          className="block font-mono text-xs text-muted-foreground hover:text-primary"
                        >
                          {proposal.leadReference}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-sm">{version.title}</TableCell>
                      <TableCell>
                        <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status]}>
                          {PROPOSAL_STATUS_LABELS[proposal.status]}
                        </Badge>
                        {proposal.isExpired ? (
                          <Badge variant="warning" className="ml-1">
                            Expired
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDay(version.validUntil)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(version.sellingPrice, version.currency)}
                      </TableCell>
                      {showMargin ? (
                        <TableCell className="text-right font-mono text-sm">
                          {version.financials
                            ? `${version.financials.marginPercent}%`
                            : // Deliberately an em dash: this row's margin was
                              // never sent to the browser.
                              '—'}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
