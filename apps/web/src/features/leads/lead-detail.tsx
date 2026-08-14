'use client';

import { isFollowUpOverdue, type Lead } from '@travel-crm/sdk';
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
import { Mail, MessageCircle, Pencil, Phone, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { useSession } from '@/features/auth/session-context';
import {
  CONTACT_METHOD_LABELS,
  formatDay,
  formatMoney,
  formatRelative,
  PRIORITY_LABELS,
  PRIORITY_VARIANTS,
  SOURCE_LABELS,
} from './lead-labels';
import { FollowUpsSection } from '@/features/follow-ups/follow-ups-section';
import { InvoicesSection } from '@/features/invoices/invoices-section';
import { ProposalsSection } from '@/features/proposals/proposals-section';
import { LeadTimeline } from './lead-timeline';
import { StageControl } from './stage-control';
import { useAssignLead, useLead, useStaff } from './use-leads';

const UNASSIGNED = '__unassigned__';

export function LeadDetail({ leadId }: { leadId: string }) {
  const lead = useLead(leadId);

  if (lead.isPending) return <LoadingState label="Loading lead…" />;

  if (lead.isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Users aria-hidden />}
          title="This lead is not available"
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

  return <LoadedLead lead={lead.data} />;
}

function LoadedLead({ lead }: { lead: Lead }) {
  const user = useSession();
  const staff = useStaff();
  const assign = useAssignLead(lead.id);
  const overdue = isFollowUpOverdue(lead);

  const reassign = async (assignedToId: string | null) => {
    try {
      await assign.mutateAsync({ assignedToId });
      toast.success(assignedToId ? 'Lead reassigned' : 'Assignment cleared');
    } catch {
      toast.error('The lead could not be reassigned.');
    }
  };

  return (
    <PageContainer
      width="full"
      title={lead.customer.name}
      description={`${lead.reference} · ${SOURCE_LABELS[lead.source]} · created ${formatRelative(lead.createdAt)}`}
      actions={
        <>
          {lead.customer.phone ? (
            <Button variant="secondary" asChild>
              <a href={`tel:${lead.customer.phone}`}>
                <Phone aria-hidden />
                Call
              </a>
            </Button>
          ) : null}
          {lead.customer.whatsapp ? (
            <Button variant="secondary" asChild>
              <a
                href={`https://wa.me/${lead.customer.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            </Button>
          ) : null}
          <Button asChild>
            <Link href={`/leads/${lead.id}/edit`}>
              <Pencil aria-hidden />
              Edit
            </Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Travel requirements</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Destination" value={lead.destination} />
              <Detail label="Departing from" value={lead.departureCity} />
              <Detail label="Travel dates">
                {lead.travelStart || lead.travelEnd
                  ? `${formatDay(lead.travelStart)} → ${formatDay(lead.travelEnd)}`
                  : '—'}
              </Detail>
              <Detail label="Travellers">
                {lead.adults === null && lead.children === null
                  ? '—'
                  : `${lead.adults ?? 0} adults, ${lead.children ?? 0} children${
                      lead.childAges.length ? ` (ages ${lead.childAges.join(', ')})` : ''
                    }`}
              </Detail>
              <Detail label="Trip type" value={lead.tripType} />
              <Detail label="Hotel category" value={lead.hotelCategory} />
              <Detail label="Meals" value={lead.mealPreference} />
              <Detail label="Requires">
                {[
                  lead.flightRequired ? 'Flights' : null,
                  lead.transportRequired ? 'Transfers' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </Detail>
              <Detail label="Budget">
                {lead.budget === null ? (
                  '—'
                ) : (
                  <Badge variant="accent">{formatMoney(lead.budget, lead.currency)}</Badge>
                )}
              </Detail>
              <Detail
                label="Activities"
                value={lead.activityRequirements}
                className="sm:col-span-2"
              />
              <Detail
                label="Special requirements"
                value={lead.specialRequirements}
                className="sm:col-span-2"
              />
              {lead.requirementSummary ? (
                <Detail label="Summary" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap">{lead.requirementSummary}</span>
                </Detail>
              ) : null}
              {lead.rawRequirement ? (
                <Detail label="Customer's own words" className="sm:col-span-2">
                  <span className="whitespace-pre-wrap text-muted-foreground">
                    {lead.rawRequirement}
                  </span>
                </Detail>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadTimeline leadId={lead.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Proposals</CardTitle>
            </CardHeader>
            <CardContent>
              <ProposalsSection lead={lead} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpsSection leadId={lead.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoices & payments</CardTitle>
            </CardHeader>
            <CardContent>
              <InvoicesSection lead={lead} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StageControl lead={lead} />

              <Detail label="Assigned to">
                {user.role === 'ADMIN' ? (
                  <Select
                    value={lead.assignedTo?.id ?? UNASSIGNED}
                    onValueChange={(next) => void reassign(next === UNASSIGNED ? null : next)}
                  >
                    <SelectTrigger aria-label="Assigned to">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {(staff.data ?? []).map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  (lead.assignedTo?.name ?? 'Unassigned')
                )}
              </Detail>

              <Detail label="Priority">
                <Badge variant={PRIORITY_VARIANTS[lead.priority]}>
                  {PRIORITY_LABELS[lead.priority]}
                </Badge>
              </Detail>

              <Detail label="Next action" value={lead.nextAction} />

              <Detail label="Next follow-up">
                {overdue ? (
                  <Badge variant="danger">Overdue · {formatRelative(lead.nextFollowUpAt)}</Badge>
                ) : (
                  formatDay(lead.nextFollowUpAt)
                )}
              </Detail>

              {lead.tags.length > 0 ? (
                <Detail label="Tags">
                  <span className="flex flex-wrap gap-1.5">
                    {lead.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </span>
                </Detail>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Detail label="Phone">
                {lead.customer.phone ? (
                  <a className="hover:text-primary" href={`tel:${lead.customer.phone}`}>
                    {lead.customer.phone}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail label="WhatsApp" value={lead.customer.whatsapp} />
              <Detail label="Email">
                {lead.customer.email ? (
                  <a
                    className="inline-flex items-center gap-1.5 hover:text-primary"
                    href={`mailto:${lead.customer.email}`}
                  >
                    <Mail className="size-3.5" aria-hidden />
                    {lead.customer.email}
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
              <Detail
                label="Preferred contact"
                value={
                  lead.customer.preferredContact
                    ? CONTACT_METHOD_LABELS[lead.customer.preferredContact]
                    : null
                }
              />
              <Detail
                label="Location"
                value={
                  [lead.customer.city, lead.customer.country].filter(Boolean).join(', ') || null
                }
              />
            </CardContent>
          </Card>

          {lead.notes ? (
            <Card>
              <CardHeader>
                <CardTitle>Internal notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}

interface DetailProps {
  label: string;
  /** Convenience for the common "text or em dash" case. */
  value?: string | null;
  children?: ReactNode;
  className?: string;
}

function Detail({ label, value, children, className }: DetailProps) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children ?? value ?? '—'}</dd>
    </div>
  );
}
