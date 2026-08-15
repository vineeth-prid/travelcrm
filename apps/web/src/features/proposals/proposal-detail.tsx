'use client';

import { LOCKED_PROPOSAL_STATUSES, type Proposal, type ProposalVersion } from '@travel-crm/sdk';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@travel-crm/ui';
import { CalendarPlus, Download, FileText, Lock, Pencil, Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ScheduleDialog } from '@/features/follow-ups/schedule-dialog';
import { formatDateTime, formatDay, formatMoney } from '@/features/leads/lead-labels';
import { useLead } from '@/features/leads/use-leads';
import { api } from '@/lib/api';
import { ProposalForm } from './proposal-form';
import { marginVariant, PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_VARIANTS } from './proposal-labels';
import {
  useGenerateProposalPdf,
  useProposal,
  useSetProposalStatus,
  useSubmitProposal,
} from './use-proposals';

export function ProposalDetail({ proposalId }: { proposalId: string }) {
  const proposal = useProposal(proposalId);

  if (proposal.isPending) return <LoadingState label="Loading proposal…" />;

  if (proposal.isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={<FileText aria-hidden />}
          title="This proposal is not available"
          description="It may have been removed, or it may belong to a colleague."
          action={
            <Button asChild variant="secondary">
              <Link href="/leads">Back to leads</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return <Loaded proposal={proposal.data.proposal} versions={proposal.data.versions} />;
}

function Loaded({ proposal, versions }: { proposal: Proposal; versions: ProposalVersion[] }) {
  const lead = useLead(proposal.leadId);
  const generate = useGenerateProposalPdf(proposal.leadId, proposal.id);
  const submit = useSubmitProposal(proposal.leadId, proposal.id);
  const setStatus = useSetProposalStatus(proposal.leadId, proposal.id);
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const current = proposal.currentVersion;
  const locked = LOCKED_PROPOSAL_STATUSES.includes(proposal.status);

  /** Opens the stored PDF in a new tab; the link is time-limited. */
  const openPdf = async (version: number) => {
    try {
      const result =
        version === current.version
          ? await generate.mutateAsync()
          : await api.proposals.versionPdf(proposal.id, version);

      if (!result.pdfUrl) {
        toast.error('That version has no PDF yet.');
        return;
      }
      window.open(result.pdfUrl, '_blank', 'noopener');
    } catch {
      toast.error('The PDF could not be produced.');
    }
  };

  const doSubmit = async () => {
    try {
      await submit.mutateAsync();
      toast.success('Recorded as sent to the customer');
    } catch {
      toast.error('Generate the PDF before submitting.');
    }
  };

  if (editing && lead.data) {
    return (
      <PageContainer
        title={locked ? `Revise ${proposal.reference}` : `Edit ${proposal.reference}`}
        description={
          locked
            ? `Version ${current.version} has gone to the customer and stays as it is. This creates version ${current.version + 1}.`
            : undefined
        }
      >
        <ProposalForm
          lead={lead.data}
          proposal={proposal}
          asNewVersion={locked}
          onDone={() => setEditing(false)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      width="full"
      title={current.title}
      description={`${proposal.reference} · ${proposal.customerName} · version ${current.version} of ${proposal.versionCount}`}
      actions={
        <>
          <Button variant="secondary" onClick={() => setScheduling(true)}>
            <CalendarPlus aria-hidden />
            Record follow-up
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {locked ? 'Revise' : 'Edit'}
          </Button>
          <Button
            variant="secondary"
            loading={generate.isPending}
            onClick={() => void openPdf(current.version)}
          >
            <Download aria-hidden />
            {current.hasPdf ? 'View PDF' : 'Generate PDF'}
          </Button>
          {proposal.status === 'DRAFT' || proposal.status === 'GENERATED' ? (
            <Button loading={submit.isPending} onClick={() => void doSubmit()}>
              <Send aria-hidden />
              Submit
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>What the customer reads</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Prose title="Executive summary" body={current.executiveSummary} />
              <Prose title="Itinerary" body={current.itinerary} />
              <Prose title="Hotels" body={current.hotelInfo} />
              <Prose title="Transport" body={current.transportInfo} />
              <Prose title="Activities" body={current.activities} />
              <Prose title="Inclusions" body={current.inclusions} />
              <Prose title="Exclusions" body={current.exclusions} />
              <Prose title="Terms & conditions" body={current.terms} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Version history</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        Version {version.version}
                        {version.version === current.version ? ' · current' : ''}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(version.createdAt)}
                        {version.createdBy ? ` · ${version.createdBy.name}` : ''}
                      </span>
                    </span>

                    <Badge variant="accent">
                      {formatMoney(version.sellingPrice, version.currency)}
                    </Badge>

                    {version.financials ? (
                      <Badge variant={marginVariant(version.financials.marginPercent)}>
                        {version.financials.marginPercent.toFixed(1)}%
                      </Badge>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!version.hasPdf && version.version !== current.version}
                      onClick={() => void openPdf(version.version)}
                    >
                      <Download aria-hidden />
                      PDF
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={PROPOSAL_STATUS_VARIANTS[proposal.status]}>
                  {PROPOSAL_STATUS_LABELS[proposal.status]}
                </Badge>
                {proposal.isExpired && proposal.status !== 'EXPIRED' ? (
                  <Badge variant="danger">Past its validity</Badge>
                ) : null}
              </div>

              {proposal.submittedAt ? (
                <Select
                  value={
                    (['FOLLOW_UP', 'NEGOTIATION', 'ACCEPTED', 'REJECTED'] as string[]).includes(
                      proposal.status,
                    )
                      ? proposal.status
                      : ''
                  }
                  onValueChange={(next) => {
                    void setStatus
                      .mutateAsync({ status: next as 'ACCEPTED' })
                      .then(() => toast.success('Response recorded'))
                      .catch(() => toast.error('That could not be recorded.'));
                  }}
                >
                  <SelectTrigger aria-label="Customer response">
                    <SelectValue placeholder="Record the response…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FOLLOW_UP">Following up</SelectItem>
                    <SelectItem value="NEGOTIATION">Negotiating</SelectItem>
                    <SelectItem value="ACCEPTED">Accepted</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Submit the proposal to start recording the customer&rsquo;s response.
                </p>
              )}

              <Detail label="Valid until" value={formatDay(current.validUntil)} />
              <Detail
                label="Submitted"
                value={
                  proposal.submittedAt
                    ? `${formatDateTime(proposal.submittedAt)}${proposal.submittedBy ? ` · ${proposal.submittedBy.name}` : ''}`
                    : 'Not yet'
                }
              />
              <Detail
                label="Lead"
                value={
                  <Link href={`/leads/${proposal.leadId}`} className="text-primary hover:underline">
                    {proposal.leadReference}
                  </Link>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Money</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Detail
                label="Package price"
                value={
                  <Badge variant="accent">
                    {formatMoney(current.sellingPrice, current.currency)}
                  </Badge>
                }
              />

              {current.financials ? (
                <>
                  <div className="rounded-lg border border-border bg-muted p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Lock className="size-3" aria-hidden />
                      Internal only
                    </p>
                    <dl className="mt-3 flex flex-col gap-3">
                      <Detail
                        label="Actual cost"
                        value={formatMoney(current.financials.actualCost, current.currency)}
                      />
                      <Detail
                        label="Gross profit"
                        value={formatMoney(current.financials.grossProfit, current.currency)}
                      />
                      <Detail
                        label="Margin"
                        value={
                          <Badge variant={marginVariant(current.financials.marginPercent)}>
                            {current.financials.marginPercent.toFixed(1)}%
                          </Badge>
                        }
                      />
                    </dl>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Cost and margin are not shown for your account.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ScheduleDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        subject={{ proposalId: proposal.id }}
        subjectLabel={proposal.reference}
      />
    </PageContainer>
  );
}

function Prose({ title, body }: { title: string; body: string | null }) {
  if (!body?.trim()) return null;
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{body}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
