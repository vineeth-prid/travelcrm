'use client';

import type { Lead } from '@travel-crm/sdk';
import { Badge, Button, EmptyState, LoadingState } from '@travel-crm/ui';
import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { formatDay, formatMoney } from '@/features/leads/lead-labels';
import { ProposalForm } from './proposal-form';
import { marginVariant, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_VARIANTS } from './proposal-labels';
import { useLeadProposals } from './use-proposals';

/** The proposals on a lead, and the button that starts a new one. */
export function ProposalsSection({ lead }: { lead: Lead }) {
  const proposals = useLeadProposals(lead.id);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <ProposalForm
        lead={lead}
        proposal={null}
        asNewVersion={false}
        onDone={() => setCreating(false)}
      />
    );
  }

  if (proposals.isPending) return <LoadingState label="Loading proposals…" />;

  if (proposals.isError) {
    return <EmptyState icon={<FileText aria-hidden />} title="Could not load proposals" />;
  }

  if (proposals.data.length === 0) {
    return (
      <EmptyState
        icon={<FileText aria-hidden />}
        title="No proposals yet"
        description="Build one from this lead's requirements, price it, and generate a branded PDF to send."
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New proposal
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {proposals.data.map((proposal) => (
          <li key={proposal.id}>
            <Link
              href={`/proposals/${proposal.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {proposal.currentVersion.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {proposal.reference} · v{proposal.currentVersion.version}
                  {proposal.versionCount > 1 ? ` of ${proposal.versionCount}` : ''} · valid until{' '}
                  {formatDay(proposal.currentVersion.validUntil)}
                </span>
              </span>

              {proposal.currentVersion.financials ? (
                <Badge variant={marginVariant(proposal.currentVersion.financials.marginPercent)}>
                  {proposal.currentVersion.financials.marginPercent.toFixed(1)}% margin
                </Badge>
              ) : null}

              <Badge variant="accent">
                {formatMoney(
                  proposal.currentVersion.sellingPrice,
                  proposal.currentVersion.currency,
                )}
              </Badge>

              <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status]}>
                {PROPOSAL_STATUS_LABELS[proposal.status]}
              </Badge>

              {proposal.isExpired && proposal.status !== 'EXPIRED' ? (
                <Badge variant="danger">Expired</Badge>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New proposal
        </Button>
      </div>
    </div>
  );
}
