'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  LEAD_STATUSES,
  updateConversationSchema,
  type Conversation,
  type ExtractedDetails,
  type UpdateConversationInput,
} from '@travel-crm/sdk';
import {
  Button,
  describedBy,
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@travel-crm/ui';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { QuotesSection } from '@/features/quotes/quotes-section';
import { applyApiErrors } from '@/lib/form-errors';
import { AiAssistant } from './ai-assistant';
import { CHANNEL_LABELS, STATUS_LABELS } from './channel';
import { useUpdateConversation } from './use-inbox';

/** Empty inputs must round-trip as "no value", which the schema normalises. */
function toFormValues(conversation: Conversation): UpdateConversationInput {
  return {
    destination: conversation.destination ?? '',
    travelMonth: conversation.travelMonth ?? '',
    adults: conversation.adults ?? '',
    children: conversation.children ?? '',
    budget: conversation.budget ?? '',
    status: conversation.status,
    notes: conversation.notes ?? '',
    email: conversation.contact.email ?? '',
  };
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

interface LeadPanelProps {
  conversation: Conversation;
  /** Hands an AI draft to the composer, which lives beside this panel. */
  onReplyDrafted: (reply: string) => void;
}

export function LeadPanel({ conversation, onReplyDrafted }: LeadPanelProps) {
  const save = useUpdateConversation(conversation.id);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<UpdateConversationInput>({
    resolver: zodResolver(updateConversationSchema),
    defaultValues: toFormValues(conversation),
  });

  // Switching conversations reuses this component; load the new lead's values.
  useEffect(() => {
    reset(toFormValues(conversation));
    // Only the identity of the conversation should reset the form — not every
    // background refetch, which would discard what the salesperson is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, reset]);

  function onSubmit(values: UpdateConversationInput) {
    // The resolver has already validated; this only applies the normalisation
    // (blank -> null, numeric strings -> numbers) that the API expects.
    save.mutate(updateConversationSchema.parse(values), {
      onSuccess: (updated) => {
        reset(toFormValues(updated));
        toast.success('Changes saved');
      },
      onError: (error) => {
        const message = applyApiErrors(error, setError);
        if (message) toast.error(message);
      },
    });
  }

  /**
   * Fills the form from an AI extraction. Only fields the model was sure about
   * are written, nothing is saved, and the form is left dirty so the
   * salesperson has to press Save themselves.
   */
  function applyExtraction(details: ExtractedDetails) {
    for (const [field, value] of Object.entries(details)) {
      if (value === null) continue;
      setValue(field as keyof ExtractedDetails, String(value), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }

  const { contact } = conversation;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex h-full w-full flex-col bg-surface"
      aria-label="Lead details"
    >
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <SectionTitle>Customer details</SectionTitle>
          <dl className="divide-y divide-border">
            <ReadOnlyRow label="Name" value={contact.name} />
            <ReadOnlyRow label="Phone" value={contact.phone ?? '—'} />
            <ReadOnlyRow label="Channel" value={CHANNEL_LABELS[conversation.channel]} />
          </dl>

          <FormField id="email" label="Email" error={errors.email?.message} className="mt-3">
            <Input
              id="email"
              type="email"
              placeholder="customer@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={describedBy('email', { error: errors.email?.message })}
              {...register('email')}
            />
          </FormField>
        </section>

        <section>
          <SectionTitle>Travel information</SectionTitle>
          <div className="flex flex-col gap-3">
            <FormField id="destination" label="Destination" error={errors.destination?.message}>
              <Input
                id="destination"
                placeholder="Bali, Maldives…"
                aria-invalid={Boolean(errors.destination)}
                {...register('destination')}
              />
            </FormField>

            <FormField id="travelMonth" label="Travel month" error={errors.travelMonth?.message}>
              <Input
                id="travelMonth"
                placeholder="March 2027"
                aria-invalid={Boolean(errors.travelMonth)}
                {...register('travelMonth')}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="adults" label="Adults" error={errors.adults?.message}>
                <Input
                  id="adults"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  aria-invalid={Boolean(errors.adults)}
                  {...register('adults')}
                />
              </FormField>

              <FormField id="children" label="Children" error={errors.children?.message}>
                <Input
                  id="children"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-invalid={Boolean(errors.children)}
                  {...register('children')}
                />
              </FormField>
            </div>

            <FormField id="budget" label="Budget" error={errors.budget?.message}>
              <Input
                id="budget"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="150000"
                aria-invalid={Boolean(errors.budget)}
                {...register('budget')}
              />
            </FormField>
          </div>
        </section>

        <section>
          <SectionTitle>Lead status</SectionTitle>
          <FormField id="status" label="Status" error={errors.status?.message} required>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" aria-invalid={Boolean(errors.status)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </section>

        <section>
          <SectionTitle>Notes</SectionTitle>
          <FormField id="notes" label="Notes" error={errors.notes?.message}>
            <Textarea
              id="notes"
              rows={5}
              placeholder="Anything worth remembering about this lead…"
              aria-invalid={Boolean(errors.notes)}
              {...register('notes')}
            />
          </FormField>
        </section>

        <hr className="border-border" />

        <AiAssistant
          conversationId={conversation.id}
          onExtracted={applyExtraction}
          onReplyDrafted={onReplyDrafted}
        />

        <hr className="border-border" />

        <QuotesSection conversation={conversation} />
      </div>

      <div className="border-t border-border p-4">
        <Button type="submit" className="w-full" loading={save.isPending} disabled={!isDirty}>
          Save
        </Button>
      </div>
    </form>
  );
}
