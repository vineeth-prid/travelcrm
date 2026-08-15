import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CURRENCIES,
  grossProfit,
  marginPercent,
  paymentStatusOf,
  type Dashboard,
  type EmployeePerformance,
  type MarginPopulation,
  type MarginStats,
  type PerformanceReport,
  type ReportQuery,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ExpensesService } from '../expenses/expenses.service';
import { fromDateOnly } from '../leads/leads.mappers';
import { PrismaService } from '../shared/prisma.service';
import { userSummarySelect } from '../users/users.service';

/**
 * The window a dashboard opens on: this month.
 *
 * A year-to-date default answers "how are we doing overall", which nobody
 * asks first thing in the morning. "How is this month going" is the question,
 * and every other period is a date picker away.
 */
const DEFAULT_MONTHS = 1;

type Currency = (typeof CURRENCIES)[number];

/** A proposal reduced to the figures reporting cares about. */
interface ScoredProposal {
  leadId: string;
  createdById: string | null;
  status: string;
  submittedAt: Date | null;
  currency: string;
  sellingPrice: number;
  actualCost: number;
  createdAt: Date;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Everything the dashboards report.
 *
 * The aggregation is done in TypeScript over rows fetched for the period
 * rather than in SQL. For an agency's volumes that is a handful of hundreds of
 * rows, and it keeps one readable definition of each figure instead of eight
 * hand-written queries that have to agree with each other.
 *
 * ponytail: in-memory aggregation over the period's rows. Move the heaviest
 * ones to SQL `groupBy` if a period ever spans tens of thousands of proposals.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
  ) {}

  async dashboard(query: ReportQuery): Promise<Dashboard> {
    const { from, to, toExclusive } = this.window(query);
    const period = { gte: from, lte: toExclusive };

    const proposals = await this.proposalsIn(period);
    const currency = query.currency ?? this.dominantCurrency(proposals);
    const mine = proposals.filter((proposal) => proposal.currency === currency);

    const [leads, invoices, followUps, expenses] = await Promise.all([
      this.prisma.lead.findMany({
        where: { createdAt: period },
        select: { id: true, stage: true, assignedToId: true },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: period, currency, status: { not: 'CANCELLED' } },
        select: {
          totalAmount: true,
          dueDate: true,
          status: true,
          payments: { select: { amount: true } },
        },
      }),
      this.followUpCounts(),
      this.expenses.summary({ from: query.from, to: query.to, currency }),
    ]);

    // --- Sales ------------------------------------------------------------
    const stageCount = (...stages: string[]) =>
      leads.filter((lead) => stages.includes(lead.stage)).length;

    const won = stageCount('WON');
    const lost = stageCount('LOST');

    const sales = {
      totalLeads: leads.length,
      newLeads: stageCount('NEW'),
      contactedLeads: stageCount('CONTACTED'),
      qualifiedLeads: stageCount('QUALIFIED'),
      proposalsCreated: mine.length,
      proposalsSent: mine.filter((proposal) => proposal.submittedAt !== null).length,
      proposalsAccepted: mine.filter((proposal) => proposal.status === 'ACCEPTED').length,
      proposalsRejected: mine.filter((proposal) => proposal.status === 'REJECTED').length,
      wonLeads: won,
      lostLeads: lost,
      // Over decided leads only: counting deals still in play as failures
      // would make every healthy pipeline look like a bad one.
      conversionRate: percent(won, won + lost),
    };

    // --- Revenue ----------------------------------------------------------
    const invoiced = invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    let collected = 0;
    let overdue = 0;

    for (const invoice of invoices) {
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
      collected += paid;

      const status = paymentStatusOf({
        totalAmount: invoice.totalAmount,
        amountPaid: paid,
        dueDate: invoice.dueDate.toISOString().slice(0, 10),
        status: invoice.status,
      });
      if (status === 'OVERDUE') overdue += invoice.totalAmount - paid;
    }

    const revenue = {
      proposedValue: mine.reduce((sum, proposal) => sum + proposal.sellingPrice, 0),
      acceptedValue: mine
        .filter((proposal) => proposal.status === 'ACCEPTED')
        .reduce((sum, proposal) => sum + proposal.sellingPrice, 0),
      invoicedAmount: invoiced,
      collectedAmount: collected,
      outstandingAmount: Math.max(0, invoiced - collected),
      overdueAmount: overdue,
    };

    // --- Profitability ----------------------------------------------------
    const submitted = mine.filter((proposal) => proposal.submittedAt !== null);
    const accepted = mine.filter((proposal) => proposal.status === 'ACCEPTED');

    const profitTrend = this.trend(accepted);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency,
      otherCurrencies: [...new Set(proposals.map((proposal) => proposal.currency))]
        .filter((item) => item !== currency)
        .sort(),

      sales,
      revenue,
      profitability: {
        submitted: this.margins('SUBMITTED', submitted),
        accepted: this.margins('ACCEPTED', accepted),
      },
      profitTrend,
      followUps,
      expenses: {
        currentMonth: expenses.currentMonthTotal,
        previousMonth: expenses.previousMonthTotal,
        periodTotal: expenses.total,
        byCategory: expenses.byCategory,
      },
    };
  }

  /**
   * Per-consultant numbers.
   *
   * An admin gets everybody. An employee gets exactly one row — their own —
   * and its margin is null unless they have been given permission to see it.
   */
  async performance(query: ReportQuery, actor: AuthenticatedUser): Promise<PerformanceReport> {
    const { from, to, toExclusive } = this.window(query);
    const period = { gte: from, lte: toExclusive };
    const isAdmin = actor.role === 'ADMIN';

    const proposals = await this.proposalsIn(period);
    const currency = query.currency ?? this.dominantCurrency(proposals);
    const mine = proposals.filter((proposal) => proposal.currency === currency);

    const [users, leads, invoices, missed] = await Promise.all([
      this.prisma.user.findMany({
        where: isAdmin ? { active: true } : { id: actor.id },
        select: userSummarySelect,
        orderBy: { name: 'asc' },
      }),
      this.prisma.lead.findMany({
        where: { createdAt: period },
        select: { id: true, stage: true, assignedToId: true, lastActivityAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: period, currency, status: { not: 'CANCELLED' } },
        select: {
          totalAmount: true,
          payments: { select: { amount: true } },
          lead: { select: { assignedToId: true } },
        },
      }),
      this.prisma.followUp.findMany({
        where: { status: 'MISSED', dueAt: period },
        select: { assignedToId: true },
      }),
    ]);

    const rows: EmployeePerformance[] = users.map((user) => {
      const theirLeads = leads.filter((lead) => lead.assignedToId === user.id);
      const theirProposals = mine.filter((proposal) => proposal.createdById === user.id);
      const theirAccepted = theirProposals.filter((proposal) => proposal.status === 'ACCEPTED');
      const theirInvoices = invoices.filter((invoice) => invoice.lead.assignedToId === user.id);

      const invoiced = theirInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
      const collected = theirInvoices.reduce(
        (sum, invoice) =>
          sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0),
        0,
      );

      const won = theirLeads.filter((lead) => lead.stage === 'WON').length;
      const lost = theirLeads.filter((lead) => lead.stage === 'LOST').length;

      // Margin is money the viewer may not be entitled to. An admin always
      // may; an employee only with the permission, and only about themselves.
      const maySeeMargin = isAdmin || (actor.canViewOwnProfitability && user.id === actor.id);

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
        },
        leadsAssigned: theirLeads.length,
        // "Contacted" means somebody moved it past NEW, not that a field was
        // ticked — the stage is the evidence.
        leadsContacted: theirLeads.filter((lead) => lead.stage !== 'NEW').length,
        proposalsCreated: theirProposals.length,
        proposalValue: theirProposals.reduce((sum, proposal) => sum + proposal.sellingPrice, 0),
        proposalsAccepted: theirAccepted.length,
        conversionRate: percent(won, won + lost),
        revenueGenerated: invoiced,
        collected,
        outstanding: Math.max(0, invoiced - collected),
        missedFollowUps: missed.filter((followUp) => followUp.assignedToId === user.id).length,
        averageMarginPercent: maySeeMargin
          ? this.margins('ACCEPTED', theirAccepted).weightedMarginPercent
          : null,
      };
    });

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency,
      rows,
    };
  }

  // --- Internals -----------------------------------------------------------

  /**
   * Both margin figures over one population, plus the label saying which.
   *
   * §25 wants both because they disagree in a way that matters: one ₹10,000
   * trip at 50% and one ₹500,000 trip at 10% average to 30%, but the business
   * kept 10.8%. The weighted figure is the one to trust.
   */
  private margins(population: MarginPopulation, proposals: ScoredProposal[]): MarginStats {
    const sellingTotal = proposals.reduce((sum, proposal) => sum + proposal.sellingPrice, 0);
    const costTotal = proposals.reduce((sum, proposal) => sum + proposal.actualCost, 0);

    const individual = proposals.map((proposal) =>
      marginPercent(proposal.sellingPrice, proposal.actualCost),
    );

    return {
      population,
      proposalCount: proposals.length,
      sellingTotal,
      costTotal,
      grossProfit: grossProfit(sellingTotal, costTotal),
      averageMarginPercent:
        individual.length === 0
          ? 0
          : Math.round(
              (individual.reduce((sum, value) => sum + value, 0) / individual.length) * 10,
            ) / 10,
      weightedMarginPercent: marginPercent(sellingTotal, costTotal),
    };
  }

  /** Revenue and profit by month, for the trend. */
  private trend(proposals: ScoredProposal[]): Dashboard['profitTrend'] {
    const months = new Map<string, { revenue: number; grossProfit: number }>();

    for (const proposal of proposals) {
      // Keyed on when it was won, not when it was drafted.
      const key = monthKey(proposal.submittedAt ?? proposal.createdAt);
      const entry = months.get(key) ?? { revenue: 0, grossProfit: 0 };
      entry.revenue += proposal.sellingPrice;
      entry.grossProfit += grossProfit(proposal.sellingPrice, proposal.actualCost);
      months.set(key, entry);
    }

    return [...months.entries()]
      .map(([month, values]) => ({ month, ...values }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  /**
   * Every proposal in the period, flattened to its current version.
   *
   * The current version is the one that counts: it is what the customer is
   * holding and what an acceptance accepted.
   */
  private async proposalsIn(period: { gte: Date; lte: Date }): Promise<ScoredProposal[]> {
    // Selected column by column rather than `include`d: a proposal version
    // carries the whole itinerary, the inclusions and the terms as text, and
    // a year of them is a lot of prose to drag out of the database to add up
    // four numbers.
    const rows = await this.prisma.proposal.findMany({
      where: { createdAt: period },
      select: {
        leadId: true,
        createdById: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        versions: {
          select: { currency: true, sellingPrice: true, actualCost: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    return rows.flatMap((proposal) => {
      const current = proposal.versions[0];
      if (!current) return [];

      return [
        {
          leadId: proposal.leadId,
          createdById: proposal.createdById,
          status: proposal.status,
          submittedAt: proposal.submittedAt,
          currency: current.currency,
          sellingPrice: current.sellingPrice,
          actualCost: current.actualCost,
          createdAt: proposal.createdAt,
        },
      ];
    });
  }

  /** Follow-up counts are about now, not the reporting period. */
  private async followUpCounts(): Promise<Dashboard['followUps']> {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setUTCHours(23, 59, 59, 999);

    // Mutable on purpose: Prisma's generated filter types reject a readonly array.
    const open: Prisma.EnumFollowUpStatusFilter = { in: ['PENDING', 'DUE'] };

    const [dueToday, upcoming, overdue, missed] = await Promise.all([
      this.prisma.followUp.count({ where: { status: open, dueAt: { lte: endOfToday } } }),
      this.prisma.followUp.count({ where: { status: open, dueAt: { gt: endOfToday } } }),
      this.prisma.followUp.count({ where: { status: open, dueAt: { lt: now } } }),
      this.prisma.followUp.count({ where: { status: 'MISSED' } }),
    ]);

    return { dueToday, upcoming, overdue, missed };
  }

  /**
   * Whichever currency the business did the most business in, over this
   * period. Validated against the supported list rather than trusted: a stray
   * value in the database must not become a filter nothing else understands.
   */
  private dominantCurrency(proposals: ScoredProposal[]): Currency {
    const totals = new Map<string, number>();
    for (const proposal of proposals) {
      totals.set(proposal.currency, (totals.get(proposal.currency) ?? 0) + proposal.sellingPrice);
    }

    const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return (CURRENCIES as readonly string[]).includes(top ?? '') ? (top as Currency) : 'INR';
  }

  private window(query: ReportQuery): { from: Date; to: Date; toExclusive: Date } {
    const now = new Date();
    const to = fromDateOnly(query.to ?? null) ?? now;
    const from =
      fromDateOnly(query.from ?? null) ??
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (DEFAULT_MONTHS - 1), 1));

    const toExclusive = new Date(to);
    toExclusive.setUTCHours(23, 59, 59, 999);

    return { from, to, toExclusive };
  }
}
