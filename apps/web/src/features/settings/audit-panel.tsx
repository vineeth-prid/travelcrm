'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** The entities the recorder writes, in the order they read most naturally. */
const ENTITIES = [
  { value: '', label: 'Everything' },
  { value: 'lead', label: 'Leads' },
  { value: 'proposal', label: 'Proposals' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'payment', label: 'Payments' },
  { value: 'expense', label: 'Expenses' },
  { value: 'follow-up', label: 'Follow-ups' },
  { value: 'user', label: 'Accounts' },
  { value: 'auth', label: 'Sign-in' },
  { value: 'smtp', label: 'Mail settings' },
  { value: 'export', label: 'Exports' },
] as const;

/** Read-only audit trail (§31). Administrators only; the API refuses the rest. */
export function AuditPanel() {
  const [entity, setEntity] = useState('');

  const query = { entity: entity || undefined, limit: 100 };
  const entries = useQuery({
    queryKey: queryKeys.audit(query),
    queryFn: ({ signal }) => api.admin.audit(query, signal),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <CardDescription>
          Who did what, including attempts that were refused. Nothing here can be edited or deleted.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1">
          {ENTITIES.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={entity === option.value ? 'primary' : 'ghost'}
              onClick={() => setEntity(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {entries.isPending ? (
          <LoadingState label="Loading the audit trail…" />
        ) : entries.isError ? (
          <p className="text-sm text-muted-foreground">The audit trail could not be loaded.</p>
        ) : entries.data.length === 0 ? (
          <EmptyState
            icon={<ScrollText aria-hidden />}
            title="Nothing recorded yet"
            description="Entries appear here as soon as somebody changes something."
          />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="w-24">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{entry.actorName}</span>
                      {entry.ip ? (
                        <span className="block text-xs text-muted-foreground">{entry.ip}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{entry.summary}</span>
                      {entry.entityId ? (
                        <span className="block font-mono text-xs text-muted-foreground">
                          {entry.entityId}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={resultVariant(entry.status)}>{entry.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function resultVariant(status: number): 'success' | 'warning' | 'danger' {
  if (status < 400) return 'success';
  return status === 401 || status === 403 || status === 429 ? 'danger' : 'warning';
}
