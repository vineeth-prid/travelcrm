'use client';

import type { PerformanceReport } from '@travel-crm/sdk';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@travel-crm/ui';

import { marginVariant } from '@/features/proposals/proposal-labels';
import { formatMoney } from '@/features/leads/lead-labels';

export function PerformanceTable({ report }: { report: PerformanceReport }) {
  if (report.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to report for this period.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Consultant</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Contacted</TableHead>
          <TableHead className="text-right">Proposals</TableHead>
          <TableHead className="text-right">Proposal value</TableHead>
          <TableHead className="text-right">Won</TableHead>
          <TableHead className="text-right">Invoiced</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
          <TableHead className="text-right">Missed</TableHead>
          <TableHead className="text-right">Margin</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {report.rows.map((row) => (
          <TableRow key={row.user.id}>
            <TableCell>
              <span className="font-medium text-foreground">{row.user.name}</span>
              <span className="block text-xs text-muted-foreground">
                {row.conversionRate}% conversion
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.leadsAssigned}</TableCell>
            <TableCell className="text-right tabular-nums">{row.leadsContacted}</TableCell>
            <TableCell className="text-right tabular-nums">{row.proposalsCreated}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.proposalValue, report.currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.proposalsAccepted}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.revenueGenerated, report.currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(row.outstanding, report.currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.missedFollowUps > 0 ? (
                <Badge variant="danger">{row.missedFollowUps}</Badge>
              ) : (
                row.missedFollowUps
              )}
            </TableCell>
            <TableCell className="text-right">
              {/* Null when the viewer may not see margin — the API withholds
                  it rather than the table hiding it. */}
              {row.averageMarginPercent === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <Badge variant={marginVariant(row.averageMarginPercent)}>
                  {row.averageMarginPercent}%
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
