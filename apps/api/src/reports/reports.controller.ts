import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  reportQuerySchema,
  type Dashboard,
  type PerformanceReport,
  type ReportQuery,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { ReportsService } from './reports.service';

const marginStatsSchema = z.object({
  population: z.enum(['SUBMITTED', 'ACCEPTED']),
  proposalCount: z.number().int(),
  sellingTotal: z.number().int(),
  costTotal: z.number().int(),
  grossProfit: z.number().int(),
  averageMarginPercent: z.number(),
  weightedMarginPercent: z.number(),
});

const dashboardSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.string(),
  otherCurrencies: z.array(z.string()),
  sales: z.object({
    totalLeads: z.number().int(),
    newLeads: z.number().int(),
    contactedLeads: z.number().int(),
    qualifiedLeads: z.number().int(),
    proposalsCreated: z.number().int(),
    proposalsSent: z.number().int(),
    proposalsAccepted: z.number().int(),
    proposalsRejected: z.number().int(),
    wonLeads: z.number().int(),
    lostLeads: z.number().int(),
    conversionRate: z.number(),
  }),
  revenue: z.object({
    proposedValue: z.number().int(),
    acceptedValue: z.number().int(),
    invoicedAmount: z.number().int(),
    collectedAmount: z.number().int(),
    outstandingAmount: z.number().int(),
    overdueAmount: z.number().int(),
  }),
  profitability: z.object({ submitted: marginStatsSchema, accepted: marginStatsSchema }),
  profitTrend: z.array(
    z.object({ month: z.string(), revenue: z.number().int(), grossProfit: z.number().int() }),
  ),
  followUps: z.object({
    dueToday: z.number().int(),
    upcoming: z.number().int(),
    overdue: z.number().int(),
    missed: z.number().int(),
  }),
  expenses: z.object({
    currentMonth: z.number().int(),
    previousMonth: z.number().int(),
    periodTotal: z.number().int(),
    byCategory: z.array(
      z.object({
        categoryId: z.string(),
        name: z.string(),
        total: z.number().int(),
        count: z.number().int(),
        share: z.number(),
      }),
    ),
  }),
});

const performanceSchema = z.object({
  from: z.string(),
  to: z.string(),
  currency: z.string(),
  rows: z.array(
    z.object({
      user: z.object({
        id: z.string().uuid(),
        name: z.string(),
        email: z.string(),
        role: z.enum(['ADMIN', 'EMPLOYEE']),
        active: z.boolean(),
      }),
      leadsAssigned: z.number().int(),
      leadsContacted: z.number().int(),
      proposalsCreated: z.number().int(),
      proposalValue: z.number().int(),
      proposalsAccepted: z.number().int(),
      conversionRate: z.number(),
      revenueGenerated: z.number().int(),
      collected: z.number().int(),
      outstanding: z.number().int(),
      missedFollowUps: z.number().int(),
      averageMarginPercent: z.number().nullable(),
    }),
  ),
});

@ApiTags('reports')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Company-wide revenue, margin and expenses. Administrators only — this is
   * exactly the data §12 keeps away from employees.
   */
  @Get('dashboard')
  @AdminOnly()
  @ApiOperation({ summary: 'The admin dashboard' })
  @ApiZodResponse(HttpStatus.OK, dashboardSchema, 'Sales, revenue, margin, follow-ups, expenses')
  dashboard(
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
  ): Promise<Dashboard> {
    return this.reports.dashboard(query);
  }

  /**
   * Open to employees, but they get exactly one row — their own — and its
   * margin only if they have been given permission to see it.
   */
  @Get('performance')
  @ApiOperation({ summary: 'Per-consultant performance' })
  @ApiZodResponse(HttpStatus.OK, performanceSchema, 'One row per consultant')
  performance(
    @Query(new ZodValidationPipe(reportQuerySchema)) query: ReportQuery,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<PerformanceReport> {
    return this.reports.performance(query, current);
  }
}
