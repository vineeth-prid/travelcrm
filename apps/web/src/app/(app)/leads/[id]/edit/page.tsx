import type { Metadata } from 'next';

import { LeadEdit } from '@/features/leads/lead-edit';

export const metadata: Metadata = { title: 'Edit lead' };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadEdit leadId={id} />;
}
