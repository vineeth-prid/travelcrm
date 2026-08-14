import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../shared/prisma.service';
import { userSummarySelect } from '../users/users.service';
import { ZodValidationPipe } from '../shared/zod';
import { csvFilename, toCsv } from './csv';

const rangeSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type Range = z.infer<typeof rangeSchema>;

/**
 * CSV exports (§28). Administrators only.
 *
 * Everything here is internal data — the proposal export carries cost and
 * margin, and the payment export carries the whole ledger — so there is no
 * employee-scoped version of these. An employee who needs their own figures
 * has the performance report.
 */
@ApiTags('exports')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller({ path: 'exports', version: '1' })
export class ExportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leads.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Leads as CSV' })
  async leads(
    @Query(new ZodValidationPipe(rangeSchema)) query: Range,
    @Res() response: Response,
  ): Promise<void> {
    const rows = await this.prisma.lead.findMany({
      where: this.period(query),
      include: { customer: true, assignedTo: { select: userSummarySelect } },
      orderBy: { createdAt: 'desc' },
    });

    this.send(
      response,
      'leads',
      [
        'Reference',
        'Customer',
        'Phone',
        'Email',
        'Destination',
        'Travel start',
        'Travel end',
        'Adults',
        'Children',
        'Budget',
        'Currency',
        'Source',
        'Stage',
        'Priority',
        'Assigned to',
        'Lost reason',
        'Next follow-up',
        'Created',
      ],
      rows.map((lead) => [
        lead.reference,
        lead.customer.name,
        lead.customer.phone,
        lead.customer.email,
        lead.destination,
        lead.travelStart,
        lead.travelEnd,
        lead.adults,
        lead.children,
        lead.budget,
        lead.currency,
        lead.source,
        lead.stage,
        lead.priority,
        lead.assignedTo?.name ?? null,
        lead.lostReason,
        lead.nextFollowUpAt,
        lead.createdAt,
      ]),
    );
  }

  @Get('proposals.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Proposals as CSV, including cost and margin' })
  async proposals(
    @Query(new ZodValidationPipe(rangeSchema)) query: Range,
    @Res() response: Response,
  ): Promise<void> {
    const rows = await this.prisma.proposal.findMany({
      where: this.period(query),
      include: {
        lead: { include: { customer: true } },
        createdBy: { select: userSummarySelect },
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });

    this.send(
      response,
      'proposals',
      [
        'Reference',
        'Customer',
        'Lead',
        'Title',
        'Destination',
        'Status',
        'Version',
        'Currency',
        'Selling price',
        'Actual cost',
        'Gross profit',
        'Margin %',
        'Created by',
        'Submitted',
        'Created',
      ],
      rows.flatMap((proposal) => {
        const current = proposal.versions[0];
        if (!current) return [];

        const profit = current.sellingPrice - current.actualCost;

        return [
          [
            proposal.reference,
            proposal.lead.customer.name,
            proposal.lead.reference,
            current.title,
            current.destination,
            proposal.status,
            current.version,
            current.currency,
            current.sellingPrice,
            current.actualCost,
            profit,
            // Computed here rather than read: the margin is never stored, and
            // an export that invented a column would be the one place it was.
            current.sellingPrice > 0 ? Math.round((profit / current.sellingPrice) * 1000) / 10 : 0,
            proposal.createdBy?.name ?? null,
            proposal.submittedAt,
            proposal.createdAt,
          ],
        ];
      }),
    );
  }

  @Get('payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Payments as CSV' })
  async payments(
    @Query(new ZodValidationPipe(rangeSchema)) query: Range,
    @Res() response: Response,
  ): Promise<void> {
    const where = this.period(query, 'paidAt');

    const rows = await this.prisma.payment.findMany({
      where,
      include: {
        recordedBy: { select: userSummarySelect },
        invoice: { include: { customer: true } },
      },
      orderBy: { paidAt: 'desc' },
    });

    this.send(
      response,
      'payments',
      [
        'Reference',
        'Date',
        'Invoice',
        'Customer',
        'Amount',
        'Currency',
        'Method',
        'Bank reference',
        'Recorded by',
        'Notes',
      ],
      rows.map((payment) => [
        payment.reference,
        payment.paidAt,
        payment.invoice.reference,
        payment.invoice.customer.name,
        payment.amount,
        payment.invoice.currency,
        payment.method,
        payment.externalReference,
        payment.recordedBy?.name ?? null,
        payment.notes,
      ]),
    );
  }

  @Get('expenses.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Expenses as CSV' })
  async expenses(
    @Query(new ZodValidationPipe(rangeSchema)) query: Range,
    @Res() response: Response,
  ): Promise<void> {
    const rows = await this.prisma.expense.findMany({
      where: this.period(query, 'spentAt'),
      include: {
        category: true,
        paidBy: { select: userSummarySelect },
        createdBy: { select: userSummarySelect },
      },
      orderBy: { spentAt: 'desc' },
    });

    this.send(
      response,
      'expenses',
      [
        'Reference',
        'Date',
        'Category',
        'Description',
        'Amount',
        'Currency',
        'Method',
        'Paid by',
        'Vendor',
        'Reference',
        'Receipt',
        'Recorded by',
        'Notes',
      ],
      rows.map((expense) => [
        expense.reference,
        expense.spentAt,
        expense.category.name,
        expense.description,
        expense.amount,
        expense.currency,
        expense.method,
        expense.paidBy?.name ?? 'Company',
        expense.vendor,
        expense.externalReference,
        expense.receiptPath !== null,
        expense.createdBy?.name ?? null,
        expense.notes,
      ]),
    );
  }

  private period(query: Range, field = 'createdAt'): Record<string, unknown> {
    if (!query.from && !query.to) return {};

    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;

    return {
      [field]: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: to } : {}),
      },
    };
  }

  private send(response: Response, what: string, headers: string[], rows: unknown[][]): void {
    response.setHeader('Content-Disposition', `attachment; filename="${csvFilename(what)}"`);
    response.send(toCsv(headers, rows));
  }
}
