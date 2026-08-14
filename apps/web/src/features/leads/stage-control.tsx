'use client';

import {
  LEAD_STAGES,
  LOST_REASONS,
  leadStageSchema,
  type Lead,
  type LeadStage,
  type LostReason,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  FormField,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@travel-crm/ui';
import { useState } from 'react';

import { LOST_REASON_LABELS, STAGE_LABELS, STAGE_VARIANTS } from './lead-labels';
import { useChangeStage } from './use-leads';

/**
 * Moving the pipeline. Marking a lead LOST opens a dialog for the reason —
 * required by the API too, so this is convenience rather than the control.
 */
export function StageControl({ lead }: { lead: Lead }) {
  const changeStage = useChangeStage(lead.id);
  const [pendingLoss, setPendingLoss] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason | ''>('');
  const [lostNotes, setLostNotes] = useState('');
  const [reasonError, setReasonError] = useState('');

  const move = async (stage: LeadStage, reason?: LostReason, notes?: string) => {
    try {
      await changeStage.mutateAsync({
        stage,
        lostReason: reason ?? null,
        lostNotes: notes?.trim() ? notes.trim() : null,
      });
      toast.success(`Moved to ${STAGE_LABELS[stage]}`);
      return true;
    } catch {
      toast.error('The stage could not be changed.');
      return false;
    }
  };

  const confirmLoss = async () => {
    const parsed = leadStageSchema.safeParse({
      stage: 'LOST',
      lostReason: lostReason || null,
      lostNotes,
    });

    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? 'Choose why this lead was lost');
      return;
    }

    setReasonError('');
    if (await move('LOST', lostReason as LostReason, lostNotes)) {
      setPendingLoss(false);
      setLostReason('');
      setLostNotes('');
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={lead.stage}
          onValueChange={(next) => {
            const stage = next as LeadStage;
            if (stage === 'LOST') {
              setPendingLoss(true);
              return;
            }
            void move(stage);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Lead stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEAD_STAGES.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {lead.stage === 'LOST' && lead.lostReason ? (
          <Badge variant={STAGE_VARIANTS.LOST}>Lost — {LOST_REASON_LABELS[lead.lostReason]}</Badge>
        ) : null}
      </div>

      <Modal
        open={pendingLoss}
        onOpenChange={setPendingLoss}
        title="Mark this lead as lost"
        description="A lost deal only teaches the business something if it says why."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingLoss(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={changeStage.isPending}
              onClick={() => void confirmLoss()}
            >
              Mark as lost
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FormField id="lostReason" label="Reason" required error={reasonError}>
            <Select
              value={lostReason}
              onValueChange={(next) => {
                setLostReason(next as LostReason);
                setReasonError('');
              }}
            >
              <SelectTrigger id="lostReason">
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {LOST_REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField id="lostNotes" label="Notes" hint="Optional. Anything worth remembering.">
            <Textarea
              id="lostNotes"
              rows={3}
              value={lostNotes}
              onChange={(event) => setLostNotes(event.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
