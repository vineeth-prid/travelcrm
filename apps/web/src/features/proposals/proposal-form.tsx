'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  CURRENCIES,
  grossProfit,
  marginPercent,
  proposalSchema,
  type DocumentTemplate,
  type Lead,
  type Proposal,
  type ProposalInput,
  type ProposalRequest,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { formatMoney } from '@/features/leads/lead-labels';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { applyApiErrors } from '@/lib/form-errors';
import { marginVariant } from './proposal-labels';
import { useCreateProposal, useReviseProposal, useUpdateProposal } from './use-proposals';

/** Fourteen days is the usual window for a holiday quotation. */
function defaultValidUntil(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A new proposal starts from what the lead already says, so the consultant is
 * correcting a draft rather than retyping the enquiry.
 */
function fromLead(lead: Lead, template?: DocumentTemplate): ProposalInput {
  return {
    title: lead.destination ? `${lead.destination} Holiday` : '',
    destination: lead.destination ?? '',
    travelStart: lead.travelStart ?? '',
    travelEnd: lead.travelEnd ?? '',
    adults: lead.adults === null ? '' : String(lead.adults),
    children: lead.children === null ? '' : String(lead.children),
    childAges: lead.childAges,
    executiveSummary: lead.requirementSummary ?? '',
    itinerary: '',
    inclusions: template?.inclusions ?? '',
    exclusions: template?.exclusions ?? '',
    hotelInfo: lead.hotelCategory ?? '',
    transportInfo: lead.transportRequired ? 'Airport transfers included.' : '',
    activities: lead.activityRequirements ?? '',
    terms: template?.terms ?? '',
    validUntil: defaultValidUntil(template?.validityDays ?? 14),
    currency: (lead.currency as ProposalInput['currency']) ?? 'INR',
    sellingPrice: '',
    actualCost: '',
  };
}

function fromProposal(proposal: Proposal): ProposalInput {
  const version = proposal.currentVersion;
  return {
    title: version.title,
    destination: version.destination ?? '',
    travelStart: version.travelStart ?? '',
    travelEnd: version.travelEnd ?? '',
    adults: version.adults === null ? '' : String(version.adults),
    children: version.children === null ? '' : String(version.children),
    childAges: version.childAges,
    executiveSummary: version.executiveSummary ?? '',
    itinerary: version.itinerary ?? '',
    inclusions: version.inclusions ?? '',
    exclusions: version.exclusions ?? '',
    hotelInfo: version.hotelInfo ?? '',
    transportInfo: version.transportInfo ?? '',
    activities: version.activities ?? '',
    terms: version.terms ?? '',
    validUntil: version.validUntil,
    currency: version.currency as ProposalInput['currency'],
    sellingPrice: String(version.sellingPrice),
    // Blank when they may not see it, so an edit cannot silently zero a figure
    // they were never shown.
    actualCost: version.financials ? String(version.financials.actualCost) : '',
  };
}

interface ProposalFormProps {
  lead: Lead;
  /** Null when creating the first version of a new proposal. */
  proposal: Proposal | null;
  /** True when a sent proposal is being revised into a new version. */
  asNewVersion: boolean;
  onDone?: () => void;
}

export function ProposalForm({ lead, proposal, asNewVersion, onDone }: ProposalFormProps) {
  const router = useRouter();
  const create = useCreateProposal(lead.id);
  const update = useUpdateProposal(lead.id, proposal?.id ?? '');
  const revise = useReviseProposal(lead.id, proposal?.id ?? '');
  const [formError, setFormError] = useState('');

  /**
   * The boilerplate a new proposal starts with — terms, inclusions, exclusions
   * and how long the quote stays valid — from Settings → Proposal template.
   * Only for a *new* proposal: an existing one keeps whatever it was written
   * with, whatever the template says today.
   */
  const template = useQuery({
    queryKey: queryKeys.template('PROPOSAL'),
    queryFn: ({ signal }) => api.documents.template('PROPOSAL', signal),
    enabled: proposal === null,
    staleTime: 10 * 60_000,
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProposalInput>({
    resolver: zodResolver(proposalSchema),
    // Revising starts from the current version too — the new one is almost
    // always the old one with a different price.
    defaultValues: proposal ? fromProposal(proposal) : fromLead(lead),
    // `values` (not defaultValues) because the template arrives after the
    // first render; anything already typed wins over it.
    values: proposal || !template.data ? undefined : fromLead(lead, template.data),
  });

  const [sellingPrice, actualCost, currency] = watch(['sellingPrice', 'actualCost', 'currency']);

  // Live preview using the same functions the server uses, so what the
  // consultant sees while typing is what will be stored.
  const price = Number(sellingPrice ?? 0) || 0;
  const cost = Number(actualCost ?? 0) || 0;
  const profit = grossProfit(price, cost);
  const margin = marginPercent(price, cost);

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const payload: ProposalRequest = proposalSchema.parse(values);

    try {
      if (proposal && asNewVersion) {
        const revised = await revise.mutateAsync(payload);
        toast.success(`Version ${revised.currentVersion.version} created`);
      } else if (proposal) {
        await update.mutateAsync(payload);
        toast.success('Proposal saved');
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Proposal ${created.reference} created`);
        router.push(`/proposals/${created.id}`);
        return;
      }
      onDone?.();
    } catch (error) {
      const message = applyApiErrors<ProposalInput>(error, setError);
      setFormError(message);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof ProposalInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  const field = (name: keyof ProposalInput) => ({
    id: name,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, { error: errorFor(name) }),
  });

  const prose = (name: keyof ProposalInput, label: string, hint: string, rows = 4) => (
    <FormField id={name} label={label} hint={hint} className="sm:col-span-2" error={errorFor(name)}>
      <Textarea {...field(name)} {...register(name)} rows={rows} />
    </FormField>
  );

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>The trip</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="title" label="Package title" required error={errorFor('title')}>
            <Input {...field('title')} {...register('title')} />
          </FormField>

          <FormField id="destination" label="Destination" error={errorFor('destination')}>
            <Input {...field('destination')} {...register('destination')} />
          </FormField>

          <FormField id="travelStart" label="Travel start" error={errorFor('travelStart')}>
            <Input {...field('travelStart')} {...register('travelStart')} type="date" />
          </FormField>

          <FormField id="travelEnd" label="Travel end" error={errorFor('travelEnd')}>
            <Input {...field('travelEnd')} {...register('travelEnd')} type="date" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField id="adults" label="Adults" error={errorFor('adults')}>
              <Input {...field('adults')} {...register('adults')} type="number" min={0} />
            </FormField>
            <FormField id="children" label="Children" error={errorFor('children')}>
              <Input {...field('children')} {...register('children')} type="number" min={0} />
            </FormField>

            {/*
             * Prefilled from the lead. A quote for two children aged 3 and 15
             * is not the same quote, and the ages were being asked for on the
             * enquiry and then dropped before the document.
             */}
            <Controller
              control={control}
              name="childAges"
              render={({ field: ages }) => (
                <FormField
                  id="childAges"
                  label="Child ages"
                  hint="Comma separated, in years."
                  error={errorFor('childAges')}
                >
                  <Input
                    id="childAges"
                    inputMode="numeric"
                    value={Array.isArray(ages.value) ? ages.value.join(', ') : ''}
                    onChange={(event) =>
                      ages.onChange(
                        event.target.value
                          .split(/[,s]+/)
                          .filter(Boolean)
                          .map((age) => Number.parseInt(age, 10))
                          .filter((age) => Number.isFinite(age)),
                      )
                    }
                  />
                </FormField>
              )}
            />
          </div>

          <FormField id="validUntil" label="Valid until" required error={errorFor('validUntil')}>
            <Input {...field('validUntil')} {...register('validUntil')} type="date" />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <FormField
              id="sellingPrice"
              label="Package price"
              required
              hint="What the customer pays. This appears on the PDF."
              error={errorFor('sellingPrice')}
            >
              <Input
                {...field('sellingPrice')}
                {...register('sellingPrice')}
                type="number"
                min={0}
              />
            </FormField>
            <FormField id="currency" label="Currency" error={errorFor('currency')}>
              <Controller
                control={control}
                name="currency"
                render={({ field: control_ }) => (
                  <Select
                    value={typeof control_.value === 'string' ? control_.value : 'INR'}
                    onValueChange={control_.onChange}
                  >
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>

          <FormField
            id="actualCost"
            label="Actual cost"
            required
            hint="What the trip costs us. Never shown to the customer."
            error={errorFor('actualCost')}
          >
            <Input {...field('actualCost')} {...register('actualCost')} type="number" min={0} />
          </FormField>

          {/* Internal panel. Marked as such so nobody turns the screen round. */}
          <div className="rounded-lg border border-border bg-muted p-4 sm:col-span-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Lock className="size-3" aria-hidden />
              Internal — never appears on the proposal
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-3">
              <Figure label="Package price" value={formatMoney(price, String(currency ?? 'INR'))} />
              <Figure label="Actual cost" value={formatMoney(cost, String(currency ?? 'INR'))} />
              <Figure label="Gross profit" value={formatMoney(profit, String(currency ?? 'INR'))} />
              <div>
                <p className="text-xs text-muted-foreground">Margin</p>
                <p className="mt-0.5">
                  <Badge variant={marginVariant(margin)}>{margin.toFixed(1)}%</Badge>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the customer reads</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {prose(
            'executiveSummary',
            'Executive summary',
            'Opens the proposal. Two or three lines.',
            3,
          )}
          {prose('itinerary', 'Itinerary', 'One line per day.', 8)}
          {prose('hotelInfo', 'Hotels', 'Names or categories, and what is confirmed.', 3)}
          {prose(
            'transportInfo',
            'Transport',
            'Transfers, internal travel, flights if included.',
            3,
          )}
          {prose('activities', 'Activities', 'Tours and experiences included in the price.', 3)}
          {prose('inclusions', 'Inclusions', 'One per line.', 5)}
          {prose(
            'exclusions',
            'Exclusions',
            'One per line. Be explicit — this prevents arguments.',
            5,
          )}
          {prose(
            'terms',
            'Terms & conditions',
            'Payment terms, cancellation, anything binding.',
            5,
          )}
        </CardContent>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          {proposal ? (asNewVersion ? 'Create new version' : 'Save changes') : 'Create proposal'}
        </Button>
      </div>
    </form>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
