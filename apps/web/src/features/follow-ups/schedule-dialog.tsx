'use client';

import { followUpCreateSchema } from '@travel-crm/sdk';
import { Button, FormField, Input, Modal, Textarea, toast } from '@travel-crm/ui';
import { useState } from 'react';

import { ApiError } from '@travel-crm/sdk';

import { useCreateFollowUp } from './use-follow-ups';

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  /** Exactly one of these. The API derives the lead from whichever is given. */
  subject: { leadId: string } | { proposalId: string } | { invoiceId: string };
  /** What is being chased, for the heading: "TDH-P-00012", "TDH-INV-00004". */
  subjectLabel: string;
}

/** Tomorrow, in the `YYYY-MM-DD` the date input wants. */
function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Records a follow-up to make.
 *
 * Submitting a proposal schedules its chases automatically; this is for
 * everything else — an enquiry nobody has answered, an invoice nobody has
 * paid, or a date the customer asked you to call back on.
 */
export function ScheduleDialog({ open, onClose, subject, subjectLabel }: ScheduleDialogProps) {
  const [dueAt, setDueAt] = useState(tomorrow());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const create = useCreateFollowUp();

  const submit = async () => {
    const parsed = followUpCreateSchema.safeParse({ ...subject, dueAt, reason });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the date and the reason');
      return;
    }

    try {
      await create.mutateAsync(parsed.data);
      toast.success('Follow-up added');

      setReason('');
      setDueAt(tomorrow());
      setError('');
      onClose();
    } catch (cause) {
      // The API refuses one while a schedule is still running; say why rather
      // than "could not be saved".
      const message =
        cause instanceof ApiError ? cause.message : 'That follow-up could not be saved.';
      setError(message);
      toast.error(message);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="sm"
      title="Record a follow-up"
      description={`Something to come back to on ${subjectLabel}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={() => void submit()}>
            Add follow-up
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField
          id="follow-up-due"
          label="Due"
          required
          hint="It falls due at the start of that day."
          error={error && !reason.trim() ? undefined : error}
        >
          <Input
            id="follow-up-due"
            type="date"
            value={dueAt}
            onChange={(event) => {
              setDueAt(event.target.value);
              setError('');
            }}
          />
        </FormField>

        <FormField
          id="follow-up-reason"
          label="What for"
          required
          hint='e.g. "Call back after they speak to their family".'
        >
          <Textarea
            id="follow-up-reason"
            rows={3}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError('');
            }}
          />
        </FormField>
      </div>
    </Modal>
  );
}
