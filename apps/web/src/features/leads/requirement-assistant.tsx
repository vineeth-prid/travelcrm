'use client';

import { ApiError, type LeadRequirementDraft } from '@travel-crm/sdk';
import { Button, FormField, Textarea, toast } from '@travel-crm/ui';
import { Sparkles } from 'lucide-react';

import { useDraftRequirement } from './use-ai-requirement';

interface RequirementAssistantProps {
  notes: string;
  onNotesChange: (value: string) => void;
  /** Called with the draft; the form decides which suggestions to take. */
  onDraft: (draft: LeadRequirementDraft) => number;
  error?: string;
}

/**
 * The rough-notes box and the assistant that tidies it.
 *
 * The assistant is entirely optional. If it is not configured, is unreachable
 * or returns nonsense, the note stays exactly where the consultant typed it and
 * the rest of the form works as normal — a failed AI call must never stand
 * between somebody and recording a lead.
 */
export function RequirementAssistant({
  notes,
  onNotesChange,
  onDraft,
  error,
}: RequirementAssistantProps) {
  const draft = useDraftRequirement();
  const tooShort = notes.trim().length < 10;

  const improve = async () => {
    try {
      const result = await draft.mutateAsync({
        text: notes.trim(),
        // The browser knows the consultant's date; the server may be elsewhere.
        today: new Date().toLocaleDateString('en-CA'),
      });

      const filled = onDraft(result);
      toast.success(
        filled === 0
          ? 'Summary written. The fields below were already filled in.'
          : `Summary written and ${filled} ${filled === 1 ? 'field' : 'fields'} filled in below — check them.`,
      );
    } catch (cause) {
      // Deliberately a toast, not a form error: nothing the consultant typed is
      // wrong, and the form is still perfectly usable by hand.
      toast.error(
        cause instanceof ApiError
          ? cause.message
          : 'The assistant is unavailable. Fill the details in below.',
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <FormField
        id="rawRequirement"
        label="Enter customer / travel details"
        hint="Paste what the customer sent, in their words. Kept verbatim on the record."
        error={error}
      >
        <Textarea
          id="rawRequirement"
          rows={5}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Family of 4, two adults and two kids aged 8 and 12. Want Dubai for 5 nights in December. Budget around 1.5 lakh. Need hotel and airport transfers and desert safari."
        />
      </FormField>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          The assistant only rewrites and organises what you have written. It never sets a price.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={tooShort}
          loading={draft.isPending}
          onClick={() => void improve()}
        >
          <Sparkles aria-hidden />
          Improve with AI
        </Button>
      </div>
    </div>
  );
}
