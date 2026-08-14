'use client';

import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STAGES,
  type LeadQuery,
  type UserSummary,
} from '@travel-crm/sdk';
import {
  Button,
  Input,
  SearchBox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@travel-crm/ui';
import { X } from 'lucide-react';

import { PRIORITY_LABELS, SOURCE_LABELS, STAGE_LABELS } from './lead-labels';

/** Radix Select cannot hold an empty string, so "any" needs a real value. */
const ANY = '__any__';

interface LeadFiltersProps {
  query: LeadQuery;
  onChange: (patch: Partial<LeadQuery>) => void;
  onReset: () => void;
  staff: UserSummary[];
  /** An employee has nobody to filter by, so the picker is hidden for them. */
  showAssignee: boolean;
}

export function LeadFilters({ query, onChange, onReset, staff, showAssignee }: LeadFiltersProps) {
  const active =
    Boolean(query.search) ||
    Boolean(query.stage) ||
    Boolean(query.source) ||
    Boolean(query.priority) ||
    Boolean(query.assignedToId) ||
    Boolean(query.destination) ||
    Boolean(query.createdFrom) ||
    Boolean(query.createdTo) ||
    Boolean(query.overdue);

  const dropdown = <T extends string>(
    label: string,
    value: T | undefined,
    values: readonly T[],
    labels: Record<T, string>,
    onSelect: (next: T | undefined) => void,
  ) => (
    <Select
      value={value ?? ANY}
      onValueChange={(next) => onSelect(next === ANY ? undefined : (next as T))}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {labels[item]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox
          className="sm:max-w-xs"
          placeholder="Name, phone, email, reference…"
          aria-label="Search leads"
          value={query.search ?? ''}
          onChange={(event) => onChange({ search: event.target.value })}
        />
        <Input
          className="sm:max-w-48"
          placeholder="Destination"
          aria-label="Filter by destination"
          value={query.destination ?? ''}
          onChange={(event) => onChange({ destination: event.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {dropdown('Stage', query.stage, LEAD_STAGES, STAGE_LABELS, (stage) => onChange({ stage }))}
        {dropdown('Priority', query.priority, LEAD_PRIORITIES, PRIORITY_LABELS, (priority) =>
          onChange({ priority }),
        )}
        {dropdown('Source', query.source, LEAD_SOURCES, SOURCE_LABELS, (source) =>
          onChange({ source }),
        )}

        {showAssignee ? (
          <Select
            value={query.assignedToId ?? ANY}
            onValueChange={(next) => onChange({ assignedToId: next === ANY ? undefined : next })}
          >
            <SelectTrigger className="w-full sm:w-48" aria-label="Assigned to">
              <SelectValue placeholder="Assigned to" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Assigned to: anyone</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            aria-label="Created from"
            value={query.createdFrom ?? ''}
            onChange={(event) => onChange({ createdFrom: event.target.value || undefined })}
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            aria-label="Created to"
            value={query.createdTo ?? ''}
            onChange={(event) => onChange({ createdTo: event.target.value || undefined })}
          />
        </div>

        <Button
          variant={query.overdue ? 'primary' : 'secondary'}
          onClick={() => onChange({ overdue: query.overdue ? undefined : true })}
          aria-pressed={Boolean(query.overdue)}
        >
          Follow-up overdue
        </Button>

        {active ? (
          <Button variant="ghost" onClick={onReset}>
            <X aria-hidden />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
