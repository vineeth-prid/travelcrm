'use client';

import { useQuery } from '@tanstack/react-query';
import type { NotificationRecord } from '@travel-crm/sdk';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';

import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

const TYPE_LABELS: Record<NotificationRecord['type'], string> = {
  FOLLOW_UP_DUE: 'Follow-up due',
  FOLLOW_UP_MISSED: 'Follow-up missed',
  FOLLOW_UP_ESCALATED: 'Escalation',
  PROPOSAL_SENT: 'Proposal sent to customer',
  LEAD_ASSIGNED: 'Lead assigned',
};
const STATUS_VARIANT: Record<NotificationRecord['status'], 'success' | 'warning' | 'danger'> = {
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
};

/**
 * What the system has emailed, and what failed.
 *
 * Follow-up mail is sent by a cron job with nobody watching, so a wrong
 * password or a blocked port is otherwise invisible until a customer is not
 * chased. The message body is deliberately not shown — it holds customer
 * details that have no business in a settings screen.
 */
export function EmailLog() {
  const log = useQuery({
    queryKey: queryKeys.notificationLog,
    queryFn: ({ signal }) => api.smtp.notifications(signal),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email activity</CardTitle>
        <CardDescription>
          The last hundred notifications the system raised, newest first.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {log.isPending ? (
          <LoadingState label="Loading email activity…" />
        ) : log.isError ? (
          <p className="text-sm text-muted-foreground">The email log could not be loaded.</p>
        ) : log.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has been sent yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Raised</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TableCell>
                    <TableCell className="text-sm text-foreground">{row.recipientEmail}</TableCell>
                    <TableCell>
                      <span className="text-sm text-foreground">{row.subject}</span>
                      <span className="block text-xs text-muted-foreground">
                        {TYPE_LABELS[row.type]}
                      </span>
                      {row.error ? (
                        <span className="block text-xs font-medium text-danger">{row.error}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
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
