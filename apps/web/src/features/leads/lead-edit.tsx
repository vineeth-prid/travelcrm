'use client';

import { Button, EmptyState, LoadingState, PageContainer } from '@travel-crm/ui';
import { Users } from 'lucide-react';
import Link from 'next/link';

import { LeadForm } from './lead-form';
import { useLead } from './use-leads';

export function LeadEdit({ leadId }: { leadId: string }) {
  const lead = useLead(leadId);

  if (lead.isPending) return <LoadingState label="Loading lead…" />;

  if (lead.isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Users aria-hidden />}
          title="This lead is not available"
          action={
            <Button asChild variant="secondary">
              <Link href="/leads">Back to leads</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer title={`Edit ${lead.data.customer.name}`} description={lead.data.reference}>
      <LeadForm lead={lead.data} />
    </PageContainer>
  );
}
