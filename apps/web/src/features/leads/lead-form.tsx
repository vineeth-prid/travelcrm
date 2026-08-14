'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONTACT_METHODS,
  CURRENCIES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  SUGGESTED_LEAD_TAGS,
  leadSchema,
  type Lead,
  type LeadInput,
  type LeadRequest,
  type LeadRequirementDraft,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  FormField,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useSession } from '@/features/auth/session-context';
import { applyApiErrors } from '@/lib/form-errors';
import { CONTACT_METHOD_LABELS, PRIORITY_LABELS, SOURCE_LABELS } from './lead-labels';
import { RequirementAssistant } from './requirement-assistant';
import { useCreateLead, useDuplicateCheck, useStaff, useUpdateLead } from './use-leads';

const UNASSIGNED = '__unassigned__';

/**
 * Fields that go through `z.preprocess` are typed `unknown` on the form side,
 * but a Radix Select needs a string. Falls back when the value is anything else.
 */
function asOption(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function toFormValues(lead: Lead | null): LeadInput {
  if (!lead) {
    return {
      customerName: '',
      phone: '',
      whatsapp: '',
      email: '',
      city: '',
      country: 'India',
      destination: '',
      departureCity: '',
      travelStart: '',
      travelEnd: '',
      adults: '2',
      children: '0',
      childAges: [],
      tripType: '',
      hotelCategory: '',
      mealPreference: '',
      transportRequired: false,
      flightRequired: false,
      activityRequirements: '',
      specialRequirements: '',
      budget: '',
      currency: 'INR',
      rawRequirement: '',
      requirementSummary: '',
      source: 'MANUAL',
      priority: 'MEDIUM',
      tags: [],
      nextAction: '',
      nextFollowUpAt: '',
      notes: '',
    };
  }

  return {
    customerId: lead.customer.id,
    customerName: lead.customer.name,
    phone: lead.customer.phone ?? '',
    whatsapp: lead.customer.whatsapp ?? '',
    email: lead.customer.email ?? '',
    preferredContact: lead.customer.preferredContact ?? undefined,
    city: lead.customer.city ?? '',
    country: lead.customer.country ?? '',
    destination: lead.destination ?? '',
    departureCity: lead.departureCity ?? '',
    travelStart: lead.travelStart ?? '',
    travelEnd: lead.travelEnd ?? '',
    adults: lead.adults === null ? '' : String(lead.adults),
    children: lead.children === null ? '' : String(lead.children),
    childAges: lead.childAges,
    tripType: lead.tripType ?? '',
    hotelCategory: lead.hotelCategory ?? '',
    mealPreference: lead.mealPreference ?? '',
    transportRequired: lead.transportRequired,
    flightRequired: lead.flightRequired,
    activityRequirements: lead.activityRequirements ?? '',
    specialRequirements: lead.specialRequirements ?? '',
    budget: lead.budget === null ? '' : String(lead.budget),
    currency: lead.currency as LeadInput['currency'],
    rawRequirement: lead.rawRequirement ?? '',
    requirementSummary: lead.requirementSummary ?? '',
    source: lead.source,
    priority: lead.priority,
    tags: lead.tags,
    assignedToId: lead.assignedTo?.id ?? null,
    nextAction: lead.nextAction ?? '',
    nextFollowUpAt: lead.nextFollowUpAt ?? '',
    notes: lead.notes ?? '',
  };
}

interface LeadFormProps {
  /** Null when creating. */
  lead: Lead | null;
}

export function LeadForm({ lead }: LeadFormProps) {
  const router = useRouter();
  const user = useSession();
  const staff = useStaff();
  const create = useCreateLead();
  const update = useUpdateLead(lead?.id ?? '');

  const [formError, setFormError] = useState('');
  /** Flipped once the consultant has seen the warning and chosen to continue. */
  const [duplicateAccepted, setDuplicateAccepted] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: toFormValues(lead),
  });

  const [phone, whatsapp, email, children, tags, rawRequirement, requirementSummary] = watch([
    'phone',
    'whatsapp',
    'email',
    'children',
    'tags',
    'rawRequirement',
    'requirementSummary',
  ]);

  // Only meaningful while creating: editing an existing lead is already tied to
  // its customer, so matching itself is not a duplicate.
  const duplicates = useDuplicateCheck(
    lead
      ? {}
      : {
          phone: String(phone ?? ''),
          whatsapp: String(whatsapp ?? ''),
          email: String(email ?? ''),
        },
  );
  const matches = lead ? [] : (duplicates.data?.matches ?? []);

  const childCount = Number(children ?? 0);
  const selectedTags = (tags ?? []) as string[];

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    // The resolver has validated already; parse applies the normalisation.
    const payload: LeadRequest = leadSchema.parse(values);

    try {
      if (lead) {
        await update.mutateAsync(payload);
        toast.success('Lead updated');
        router.push(`/leads/${lead.id}`);
        return;
      }

      const created = await create.mutateAsync({
        input: payload,
        allowDuplicate: duplicateAccepted,
      });
      toast.success(`Lead ${created.reference} created`);
      router.push(`/leads/${created.id}`);
    } catch (error) {
      const message = applyApiErrors<LeadInput>(error, setError);
      setFormError(message);
      if (message) toast.error(message);
    }
  });

  /**
   * Takes an AI draft into the form.
   *
   * Only fills fields that are still empty. Overwriting something a consultant
   * typed with a model's reading of the same notes is the one behaviour that
   * would make the button dangerous rather than useful — they can always clear
   * a field and run it again. The summary is the exception: it is entirely the
   * assistant's product, so a rerun replaces it.
   *
   * Returns how many fields were filled, for the confirmation message.
   */
  const applyDraft = (draft: LeadRequirementDraft): number => {
    const current = getValues();
    let filled = 0;

    const isEmpty = (value: unknown) =>
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    const fill = (name: keyof LeadInput, value: string | number | number[] | null) => {
      if (value === null || value === undefined) return;
      if (!isEmpty(current[name])) return;
      setValue(name, value as never, { shouldDirty: true, shouldValidate: true });
      filled += 1;
    };

    const { fields } = draft;
    fill('destination', fields.destination);
    fill('departureCity', fields.departureCity);
    fill('travelStart', fields.travelStart);
    fill('travelEnd', fields.travelEnd);
    fill('adults', fields.adults);
    fill('children', fields.children);
    fill('childAges', fields.childAges);
    fill('tripType', fields.tripType);
    fill('hotelCategory', fields.hotelCategory);
    fill('mealPreference', fields.mealPreference);
    fill('activityRequirements', fields.activityRequirements);
    fill('specialRequirements', fields.specialRequirements);
    fill('budget', fields.budget);

    // Booleans have no "empty" state, so they only ever turn a requirement on.
    for (const name of ['transportRequired', 'flightRequired'] as const) {
      if (fields[name] && !current[name]) {
        setValue(name, true, { shouldDirty: true });
        filled += 1;
      }
    }

    setValue('requirementSummary', draft.summary, { shouldDirty: true });
    return filled;
  };

  /** Message for a field, whatever shape react-hook-form stored it in. */
  const errorFor = (name: keyof LeadInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  const field = (name: keyof LeadInput) => ({
    id: name,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, { error: errorFor(name) }),
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-6" noValidate>
      {matches.length > 0 && !duplicateAccepted ? (
        <Card className="border-warning-border bg-warning-subtle">
          <CardContent className="flex flex-col gap-3 p-4">
            <p className="flex items-start gap-2 text-sm font-medium text-warning-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              An existing customer with these contact details already exists.
            </p>
            <ul className="flex flex-col gap-1 pl-6 text-sm text-foreground">
              {matches.map((match) => (
                <li key={match.customerId}>
                  <span className="font-medium">{match.customerName}</span>
                  {' — '}
                  {match.leadCount} {match.leadCount === 1 ? 'trip' : 'trips'}
                  {match.latestLeadReference ? ` (latest ${match.latestLeadReference})` : ''}
                  {`, matched on ${match.matchedOn.join(' and ')}`}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pl-6">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDuplicateAccepted(true)}
              >
                This is a different trip — continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="customerName" label="Full name" required error={errorFor('customerName')}>
            <Input {...field('customerName')} {...register('customerName')} autoComplete="name" />
          </FormField>

          <FormField
            id="preferredContact"
            label="Preferred contact"
            error={errorFor('preferredContact')}
          >
            <Controller
              control={control}
              name="preferredContact"
              render={({ field: control_ }) => (
                <Select value={asOption(control_.value, '')} onValueChange={control_.onChange}>
                  <SelectTrigger id="preferredContact">
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {CONTACT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField
            id="phone"
            label="Phone"
            hint="At least one of phone, WhatsApp or email is required."
            error={errorFor('phone')}
          >
            <Input {...field('phone')} {...register('phone')} inputMode="tel" autoComplete="tel" />
          </FormField>

          <FormField id="whatsapp" label="WhatsApp" error={errorFor('whatsapp')}>
            <Input {...field('whatsapp')} {...register('whatsapp')} inputMode="tel" />
          </FormField>

          <FormField id="email" label="Email" error={errorFor('email')}>
            <Input {...field('email')} {...register('email')} type="email" autoComplete="email" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField id="city" label="City" error={errorFor('city')}>
              <Input {...field('city')} {...register('city')} />
            </FormField>
            <FormField id="country" label="Country" error={errorFor('country')}>
              <Input {...field('country')} {...register('country')} />
            </FormField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the customer asked for</CardTitle>
        </CardHeader>
        <CardContent>
          <RequirementAssistant
            notes={String(rawRequirement ?? '')}
            onNotesChange={(value) => setValue('rawRequirement', value, { shouldDirty: true })}
            onDraft={applyDraft}
            error={errorFor('rawRequirement')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Travel requirements</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="destination" label="Destination" error={errorFor('destination')}>
            <Input {...field('destination')} {...register('destination')} />
          </FormField>

          <FormField id="departureCity" label="Departing from" error={errorFor('departureCity')}>
            <Input {...field('departureCity')} {...register('departureCity')} />
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
          </div>

          <FormField
            id="childAges"
            label="Child ages"
            hint="One box per child."
            error={errorFor('childAges')}
          >
            <Controller
              control={control}
              name="childAges"
              render={({ field: control_ }) => {
                const ages = (control_.value ?? []) as (number | string)[];
                return (
                  <div className="flex flex-wrap gap-2">
                    {childCount === 0 ? (
                      <p className="text-sm text-muted-foreground">No children on this trip.</p>
                    ) : (
                      Array.from({ length: Math.min(childCount, 12) }, (_, index) => (
                        <Input
                          key={index}
                          className="w-16"
                          type="number"
                          min={0}
                          max={17}
                          aria-label={`Age of child ${index + 1}`}
                          value={ages[index] ?? ''}
                          onChange={(event) => {
                            const next = [...ages];
                            next[index] = event.target.value;
                            control_.onChange(
                              next.filter((age) => age !== '' && age !== undefined),
                            );
                          }}
                        />
                      ))
                    )}
                  </div>
                );
              }}
            />
          </FormField>

          <FormField id="tripType" label="Trip type" error={errorFor('tripType')}>
            <Input
              {...field('tripType')}
              {...register('tripType')}
              placeholder="Family, honeymoon, corporate…"
            />
          </FormField>

          <FormField id="hotelCategory" label="Hotel category" error={errorFor('hotelCategory')}>
            <Input
              {...field('hotelCategory')}
              {...register('hotelCategory')}
              placeholder="4 star"
            />
          </FormField>

          <FormField id="mealPreference" label="Meals" error={errorFor('mealPreference')}>
            <Input
              {...field('mealPreference')}
              {...register('mealPreference')}
              placeholder="Breakfast only, vegetarian…"
            />
          </FormField>

          <div className="flex flex-col justify-end gap-3 pb-1">
            {(
              [
                ['transportRequired', 'Transport / transfers required'],
                ['flightRequired', 'Flights required'],
              ] as const
            ).map(([name, label]) => (
              <div key={name} className="flex items-center gap-2">
                <Controller
                  control={control}
                  name={name}
                  render={({ field: control_ }) => (
                    <Checkbox
                      id={name}
                      checked={Boolean(control_.value)}
                      onCheckedChange={control_.onChange}
                    />
                  )}
                />
                <Label htmlFor={name}>{label}</Label>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_7rem] gap-4">
            <FormField id="budget" label="Approximate budget" error={errorFor('budget')}>
              <Input {...field('budget')} {...register('budget')} type="number" min={0} />
            </FormField>
            <FormField id="currency" label="Currency" error={errorFor('currency')}>
              <Controller
                control={control}
                name="currency"
                render={({ field: control_ }) => (
                  <Select value={control_.value ?? 'INR'} onValueChange={control_.onChange}>
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          </div>

          <FormField
            id="activityRequirements"
            label="Activities"
            className="sm:col-span-2"
            error={errorFor('activityRequirements')}
          >
            <Textarea
              {...field('activityRequirements')}
              {...register('activityRequirements')}
              rows={2}
              placeholder="Desert safari, city tour…"
            />
          </FormField>

          <FormField
            id="specialRequirements"
            label="Special requirements"
            className="sm:col-span-2"
            error={errorFor('specialRequirements')}
          >
            <Textarea
              {...field('specialRequirements')}
              {...register('specialRequirements')}
              rows={2}
              placeholder="Wheelchair access, dietary needs, anniversary…"
            />
          </FormField>

          {/* Written by the assistant, then owned by the consultant. Hidden
              until there is one, so an empty box does not imply an obligation. */}
          {requirementSummary ? (
            <FormField
              id="requirementSummary"
              label="Requirement summary"
              className="sm:col-span-2"
              hint="Goes on the proposal. Edit it freely."
              error={errorFor('requirementSummary')}
            >
              <Textarea
                {...field('requirementSummary')}
                {...register('requirementSummary')}
                rows={6}
              />
            </FormField>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Handling</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField id="source" label="Lead source" error={errorFor('source')}>
            <Controller
              control={control}
              name="source"
              render={({ field: control_ }) => (
                <Select value={control_.value ?? 'MANUAL'} onValueChange={control_.onChange}>
                  <SelectTrigger id="source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_SOURCES.map((source) => (
                      <SelectItem key={source} value={source}>
                        {SOURCE_LABELS[source]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          <FormField id="priority" label="Priority" error={errorFor('priority')}>
            <Controller
              control={control}
              name="priority"
              render={({ field: control_ }) => (
                <Select value={control_.value ?? 'MEDIUM'} onValueChange={control_.onChange}>
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {PRIORITY_LABELS[priority]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>

          {user.role === 'ADMIN' ? (
            <FormField id="assignedToId" label="Assign to" error={errorFor('assignedToId')}>
              <Controller
                control={control}
                name="assignedToId"
                render={({ field: control_ }) => (
                  <Select
                    value={asOption(control_.value, UNASSIGNED)}
                    onValueChange={(next) => control_.onChange(next === UNASSIGNED ? null : next)}
                  >
                    <SelectTrigger id="assignedToId">
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
                )}
              />
            </FormField>
          ) : null}

          <FormField id="nextAction" label="Next action" error={errorFor('nextAction')}>
            <Input
              {...field('nextAction')}
              {...register('nextAction')}
              placeholder="Send a shortlist of hotels"
            />
          </FormField>

          <FormField id="nextFollowUpAt" label="Next follow-up" error={errorFor('nextFollowUpAt')}>
            <Input {...field('nextFollowUpAt')} {...register('nextFollowUpAt')} type="date" />
          </FormField>

          <FormField id="tags" label="Tags" className="sm:col-span-2" error={errorFor('tags')}>
            <Controller
              control={control}
              name="tags"
              render={() => (
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_LEAD_TAGS.map((tag) => {
                    const on = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setValue(
                            'tags',
                            on
                              ? selectedTags.filter((item) => item !== tag)
                              : [...selectedTags, tag],
                            { shouldDirty: true },
                          )
                        }
                        aria-pressed={on}
                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Badge variant={on ? 'primary' : 'neutral'}>{tag}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </FormField>

          <FormField
            id="notes"
            label="Internal notes"
            className="sm:col-span-2"
            hint="Never shown to the customer."
            error={errorFor('notes')}
          >
            <Textarea {...field('notes')} {...register('notes')} rows={3} />
          </FormField>
        </CardContent>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" asChild>
          <Link href={lead ? `/leads/${lead.id}` : '/leads'}>Cancel</Link>
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {lead ? 'Save changes' : 'Create lead'}
        </Button>
      </div>
    </form>
  );
}
