import type { Metadata } from 'next';

import { ProposalDetail } from '@/features/proposals/proposal-detail';

export const metadata: Metadata = { title: 'Proposal' };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProposalDetail proposalId={id} />;
}
