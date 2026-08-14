'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  followUpRuleSchema,
  type FollowUpRule,
  type FollowUpRuleInput,
  type FollowUpRuleRequest,
} from '@travel-crm/sdk';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  Label,
  LoadingState,
  Modal,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@travel-crm/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { applyApiErrors } from '@/lib/form-errors';

import { useFollowUpRules, useSaveFollowUpRule } from './use-follow-ups';

const BLANK: FollowUpRuleInput = {
  name: '',
  offsetDays: [2, 5, 10],
  notifyAssignee: true,
  graceHours: 24,
  mandatory: false,
  escalateAfterMissed: null,
  isDefault: false,
  active: true,
};

/** "2, 5, 10" — the way an operations manager would write a schedule down. */
function parseDays(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10))
    .filter((day) => Number.isFinite(day));
}

/** Follow-up schedules (§26). Administrators only; the API enforces it. */
export function RulesPanel() {
  const rules = useFollowUpRules();
  const [editing, setEditing] = useState<FollowUpRule | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">Schedules</h2>
          <p className="text-sm text-muted-foreground">
            When a proposal is submitted, the default schedule decides what gets chased and when.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New schedule
        </Button>
      </div>

      {rules.isPending ? (
        <LoadingState label="Loading schedules…" />
      ) : rules.isError ? (
        <p className="text-sm text-muted-foreground">The schedules could not be loaded.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Follow-ups after</TableHead>
              <TableHead>Grace</TableHead>
              <TableHead>Escalates</TableHead>
              <TableHead className="w-24">
                <span className="sr-only">Edit</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.data.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>
                  <span className="font-medium text-foreground">{rule.name}</span>
                  <span className="ml-2 inline-flex gap-1">
                    {rule.isDefault ? <Badge variant="primary">Default</Badge> : null}
                    {rule.active ? null : <Badge variant="neutral">Off</Badge>}
                    {rule.mandatory ? <Badge variant="warning">Mandatory</Badge> : null}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rule.offsetDays.map((day) => `day ${day}`).join(', ')}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{rule.graceHours}h</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {rule.escalateAfterMissed ? `after ${rule.escalateAfterMissed} missed` : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                      Edit
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <RuleDialog
        open={creating || editing !== null}
        rule={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function RuleDialog({
  open,
  rule,
  onClose,
}: {
  open: boolean;
  rule: FollowUpRule | null;
  onClose: () => void;
}) {
  const save = useSaveFollowUpRule();
  const [days, setDays] = useState('');

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpRuleInput>({
    resolver: zodResolver(followUpRuleSchema),
    values: rule
      ? {
          name: rule.name,
          offsetDays: rule.offsetDays,
          notifyAssignee: rule.notifyAssignee,
          graceHours: rule.graceHours,
          mandatory: rule.mandatory,
          escalateAfterMissed: rule.escalateAfterMissed,
          isDefault: rule.isDefault,
          active: rule.active,
        }
      : BLANK,
  });

  const errorFor = (name: keyof FollowUpRuleInput): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === 'string' ? message : undefined;
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const input: FollowUpRuleRequest = followUpRuleSchema.parse(values);
      await save.mutateAsync({ id: rule?.id ?? null, input });
      toast.success(rule ? 'Schedule updated' : 'Schedule created');
      setDays('');
      onClose();
    } catch (error) {
      const message = applyApiErrors<FollowUpRuleInput>(error, setError);
      if (message) toast.error(message);
    }
  });

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={rule ? `Edit ${rule.name}` : 'New schedule'}
      description="Days are counted from the moment the proposal is sent."
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
        <FormField id="rule-name" label="Name" required error={errorFor('name')}>
          <Input id="rule-name" {...register('name')} />
        </FormField>

        <Controller
          control={control}
          name="offsetDays"
          render={({ field }) => {
            const shown = days || (Array.isArray(field.value) ? field.value.join(', ') : '');
            return (
              <FormField
                id="rule-days"
                label="Follow up on days"
                required
                hint="Soonest first, e.g. 2, 5, 10."
                error={errorFor('offsetDays')}
              >
                <Input
                  id="rule-days"
                  inputMode="numeric"
                  value={shown}
                  onChange={(event) => {
                    setDays(event.target.value);
                    field.onChange(parseDays(event.target.value));
                  }}
                />
              </FormField>
            );
          }}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="rule-grace"
            label="Grace period (hours)"
            required
            hint="How long before an unactioned follow-up counts as missed."
            error={errorFor('graceHours')}
          >
            <Input id="rule-grace" type="number" min={1} max={168} {...register('graceHours')} />
          </FormField>

          <FormField
            id="rule-escalate"
            label="Escalate after"
            hint="Missed follow-ups before the manager is told. Blank never escalates."
            error={errorFor('escalateAfterMissed')}
          >
            <Input
              id="rule-escalate"
              type="number"
              min={1}
              max={12}
              {...register('escalateAfterMissed')}
            />
          </FormField>
        </div>

        {(
          [
            ['notifyAssignee', 'Email the consultant when one falls due'],
            ['mandatory', 'Mandatory — cannot be skipped, only recorded'],
            ['isDefault', 'Use this schedule for new proposals'],
            ['active', 'Active'],
          ] as const
        ).map(([name, label]) => (
          <div key={name} className="flex items-center gap-2">
            <Controller
              control={control}
              name={name}
              render={({ field }) => (
                <Checkbox
                  id={`rule-${name}`}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor={`rule-${name}`}>{label}</Label>
          </div>
        ))}
      </div>
    </Modal>
  );
}
