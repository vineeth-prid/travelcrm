'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CONTACT_METHODS,
  FOLLOW_UP_OUTCOMES,
  followUpCompleteSchema,
  type FollowUp,
  type FollowUpCompleteInput,
  type FollowUpCompleteRequest,
  type FollowUpOutcome,
} from '@travel-crm/sdk';
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  describedBy,
  toast,
} from '@travel-crm/ui';
import { Controller, useForm } from 'react-hook-form';

import { CONTACT_METHOD_LABELS } from '@/features/leads/lead-labels';
import { applyApiErrors } from '@/lib/form-errors';
import { CLOSING_OUTCOMES, OUTCOME_LABELS } from './follow-up-labels';
import { useCompleteFollowUp } from './use-follow-ups';

interface CompleteDialogProps {
  followUp: FollowUp | null;
  onClose: () => void;
}

/** Recording what happened. The only thing that closes a follow-up. */
export function CompleteDialog({ followUp, onClose }: CompleteDialogProps) {
  const complete = useCompleteFollowUp(followUp?.leadId ?? null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpCompleteInput>({
    resolver: zodResolver(followUpCompleteSchema),
    defaultValues: { comment: '', nextAction: '', nextFollowUpAt: '' },
  });

  const outcome = watch('outcome') as FollowUpOutcome | undefined;
  const closes = outcome !== undefined && CLOSING_OUTCOMES.includes(outcome);

  const onSubmit = handleSubmit(async (values) => {
    if (!followUp) return;
    const payload: FollowUpCompleteRequest = followUpCompleteSchema.parse(values);

    try {
      await complete.mutateAsync({ id: followUp.id, input: payload });
      toast.success('Follow-up recorded');
      reset();
      onClose();
    } catch (error) {
      const message = applyApiErrors<FollowUpCompleteInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  const errorFor = (name: keyof FollowUpCompleteInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  return (
    <Modal
      open={followUp !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Record the follow-up"
      description={
        followUp
          ? `${followUp.customerName} · ${followUp.proposalReference} · follow-up ${followUp.sequence}`
          : undefined
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={() => void onSubmit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          id="comment"
          label="What happened?"
          required
          hint="A note now saves an argument later."
          error={errorFor('comment')}
        >
          <Textarea
            id="comment"
            rows={4}
            aria-invalid={Boolean(errors.comment)}
            aria-describedby={describedBy('comment', { error: errorFor('comment') })}
            {...register('comment')}
            placeholder="Called. Wants a 5-star option and will decide by Friday."
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="contactMethod" label="How?" required error={errorFor('contactMethod')}>
            <Controller
              control={control}
              name="contactMethod"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="contactMethod">
                    <SelectValue placeholder="Choose…" />
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

          <FormField id="outcome" label="Outcome" required error={errorFor('outcome')}>
            <Controller
              control={control}
              name="outcome"
              render={({ field }) => (
                <Select
                  value={typeof field.value === 'string' ? field.value : ''}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger id="outcome">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {FOLLOW_UP_OUTCOMES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {OUTCOME_LABELS[item]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        </div>

        {closes ? (
          <p className="rounded-lg border border-info-border bg-info-subtle px-3 py-2 text-sm text-info-foreground">
            This outcome closes the schedule — the remaining follow-ups on this proposal will be
            cancelled.
          </p>
        ) : null}

        <FormField id="nextAction" label="Next action" error={errorFor('nextAction')}>
          <Input id="nextAction" {...register('nextAction')} placeholder="Send a 5-star option" />
        </FormField>

        <FormField
          id="nextFollowUpAt"
          label="Call back on"
          hint="Optional. Overrides the schedule when the customer names a date."
          error={errorFor('nextFollowUpAt')}
        >
          <Input id="nextFollowUpAt" type="date" {...register('nextFollowUpAt')} />
        </FormField>
      </div>
    </Modal>
  );
}
