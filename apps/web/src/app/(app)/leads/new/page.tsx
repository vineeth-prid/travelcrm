import { PageContainer } from '@travel-crm/ui';
import type { Metadata } from 'next';

import { LeadForm } from '@/features/leads/lead-form';

export const metadata: Metadata = { title: 'New lead' };

export default function NewLeadPage() {
  return (
    <PageContainer
      title="New lead"
      description="Record the customer and what they are looking for. Everything except the name can be filled in later."
    >
      <LeadForm lead={null} />
    </PageContainer>
  );
}
