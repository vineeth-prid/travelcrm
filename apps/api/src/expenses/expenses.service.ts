import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MIME_TYPES,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryRequest,
  type ExpenseQuery,
  type ExpenseRequest,
  type ExpenseSummary,
  type ExpenseSummaryQuery,
} from '@travel-crm/sdk';

import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { fromDateOnly } from '../leads/leads.mappers';
import { PrismaService } from '../shared/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  expenseInclude,
  slugify,
  toExpense,
  toExpenseCategory,
  type ExpenseWithRelations,
} from './expenses.mappers';

/** The default reporting window when none is given: the last twelve months. */
const DEFAULT_MONTHS = 12;

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Company spending.
 *
 * Administrators only, at every entry point — §12 is explicit that employees
 * do not get company-wide expenses, so unlike leads there is no per-row scope
 * to apply. The guard on the controller is the whole access model.
 */
@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // --- Categories ----------------------------------------------------------

  async listCategories(): Promise<ExpenseCategory[]> {
    const rows = await this.prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toExpenseCategory);
  }

  async createCategory(input: ExpenseCategoryRequest): Promise<ExpenseCategory> {
    try {
      const row = await this.prisma.expenseCategory.create({
        data: {
          name: input.name,
          slug: slugify(input.name),
          active: input.active ?? true,
          sortOrder: input.sortOrder ?? 500,
        },
      });
      return toExpenseCategory(row);
    } catch (error) {
      throw this.categoryConflict(error, input.name);
    }
  }

  /**
   * Renames or deactivates a category. The slug is never changed: it is what
   * ties a year of reporting together, and "Marketing" becoming "Marketing &
   * PR" should not look like a different category.
   */
  async updateCategory(id: string, input: ExpenseCategoryRequest): Promise<ExpenseCategory> {
    await this.findCategoryOrFail(id);

    try {
      const row = await this.prisma.expenseCategory.update({
        where: { id },
        data: {
          name: input.name,
          ...(input.active === undefined ? {} : { active: input.active }),
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
      });
      return toExpenseCategory(row);
    } catch (error) {
      throw this.categoryConflict(error, input.name);
    }
  }

  // --- Expenses ------------------------------------------------------------

  async list(query: ExpenseQuery): Promise<Expense[]> {
    const rows = await this.prisma.expense.findMany({
      where: this.whereFrom(query),
      include: expenseInclude,
      orderBy: { spentAt: 'desc' },
      take: query.limit ?? 200,
    });
    return rows.map(toExpense);
  }

  async create(input: ExpenseRequest, actor: AuthenticatedUser): Promise<Expense> {
    await this.findCategoryOrFail(input.categoryId);

    const record = await this.prisma.expense.create({
      data: { ...this.bodyOf(input), createdById: actor.id },
      include: expenseInclude,
    });

    return toExpense(record);
  }

  async update(id: string, input: ExpenseRequest): Promise<Expense> {
    await this.findOrFail(id);
    await this.findCategoryOrFail(input.categoryId);

    const record = await this.prisma.expense.update({
      where: { id },
      data: this.bodyOf(input),
      include: expenseInclude,
    });

    return toExpense(record);
  }

  /**
   * Deletes an expense outright.
   *
   * Unlike an invoice, an expense is an internal record with no counterparty
   * relying on it, so a mistyped one is simply removed. The receipt is left in
   * object storage rather than deleted — orphaned bytes are cheap, and a
   * delete that also destroys the evidence is hard to undo.
   */
  async remove(id: string): Promise<void> {
    const record = await this.findOrFail(id);
    await this.prisma.expense.delete({ where: { id } });
    this.logger.log(`Deleted expense ${record.reference}`);
  }

  // --- Receipts ------------------------------------------------------------

  /**
   * Stores a receipt against an expense.
   *
   * The MIME type is checked against a whitelist rather than trusted, and the
   * size is capped: this endpoint takes a file from a browser and puts it in
   * object storage, which is exactly the shape of thing that becomes a file
   * host if it is left open.
   */
  async attachReceipt(
    id: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<Expense> {
    const record = await this.findOrFail(id);

    if (!RECEIPT_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `A receipt must be a PDF or an image. That file is ${file.mimetype}.`,
      );
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new BadRequestException(
        `That file is too large. The limit is ${Math.round(RECEIPT_MAX_BYTES / 1024 / 1024)}MB.`,
      );
    }

    // Letters and digits only: the extension is the one part of the object key
    // that comes from a filename somebody else chose, so it gets stripped to
    // something that cannot introduce a path segment.
    const extension =
      file.originalname
        .split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 5) || 'bin';
    const key = `expenses/${record.id}/receipt.${extension}`;

    await this.storage.put(key, file.buffer, file.mimetype);

    const updated = await this.prisma.expense.update({
      where: { id },
      data: {
        receiptPath: key,
        // The original filename is kept for display only; the stored key is
        // derived, so a hostile name cannot influence where it lands.
        receiptName: file.originalname.slice(0, 160),
      },
      include: expenseInclude,
    });

    return toExpense(updated);
  }

  /** A time-limited link. Authorisation happens here, not at the object store. */
  async receiptUrl(id: string): Promise<{ url: string; name: string | null }> {
    const record = await this.findOrFail(id);

    if (!record.receiptPath) {
      throw new NotFoundException('That expense has no receipt attached.');
    }

    return {
      url: await this.storage.presignedUrl(record.receiptPath),
      name: record.receiptName,
    };
  }

  // --- The dashboard -------------------------------------------------------

  /**
   * Totals, categories and the monthly trend, over one period and one
   * currency. See ExpenseSummary for why a single currency.
   */
  async summary(query: ExpenseSummaryQuery): Promise<ExpenseSummary> {
    const now = new Date();
    const to = fromDateOnly(query.to ?? null) ?? now;
    const from =
      fromDateOnly(query.from ?? null) ??
      new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - (DEFAULT_MONTHS - 1), 1));

    // Inclusive of the whole day chosen as the end of the period.
    const toExclusive = new Date(to);
    toExclusive.setUTCHours(23, 59, 59, 999);

    const period = { gte: from, lte: toExclusive };

    // Which currency to report in: the one asked for, or whichever the
    // business actually uses most in this period.
    const present = await this.prisma.expense.groupBy({
      by: ['currency'],
      where: { spentAt: period },
      _sum: { amount: true },
    });

    const dominant =
      [...present].sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))[0]?.currency ??
      'INR';
    const currency = query.currency ?? dominant;

    const where = { spentAt: period, currency };

    const [totals, categories, rows] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
      this.prisma.expense.groupBy({
        by: ['categoryId'],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      // Grouping by month is done here rather than in SQL: date_trunc would
      // need raw SQL, and the row count in a reporting period is small.
      this.prisma.expense.findMany({
        where,
        select: { spentAt: true, amount: true },
        orderBy: { spentAt: 'asc' },
      }),
    ]);

    const total = totals._sum.amount ?? 0;
    const categoryNames = new Map(
      (await this.prisma.expenseCategory.findMany()).map((row) => [row.id, row.name]),
    );

    const byCategory = categories
      .map((group) => {
        const groupTotal = group._sum.amount ?? 0;
        return {
          categoryId: group.categoryId,
          name: categoryNames.get(group.categoryId) ?? 'Unknown',
          total: groupTotal,
          count: group._count,
          // Guarded: a period with no spending must not divide by zero.
          share: total > 0 ? Math.round((groupTotal / total) * 1000) / 10 : 0,
        };
      })
      // Highest first, which is what "highest expense categories" means.
      .sort((a, b) => b.total - a.total);

    const months = new Map<string, number>();
    for (const row of rows) {
      const key = monthKey(row.spentAt);
      months.set(key, (months.get(key) ?? 0) + row.amount);
    }

    const thisMonth = startOfMonth(now);
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency,
      total,
      count: totals._count,
      byCategory,
      byMonth: [...months.entries()]
        .map(([month, amount]) => ({ month, total: amount }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      currentMonthTotal: months.get(monthKey(thisMonth)) ?? 0,
      previousMonthTotal: months.get(monthKey(lastMonth)) ?? 0,
      // Named rather than silently dropped, so nothing disappears from view.
      otherCurrencies: present
        .map((group) => group.currency)
        .filter((item) => item !== currency)
        .sort(),
    };
  }

  // --- Internals -----------------------------------------------------------

  private whereFrom(query: ExpenseQuery): Prisma.ExpenseWhereInput {
    const where: Prisma.ExpenseWhereInput = {};

    const from = fromDateOnly(query.from ?? null);
    const to = fromDateOnly(query.to ?? null);
    if (from || to) {
      const end = to ? new Date(to) : undefined;
      end?.setUTCHours(23, 59, 59, 999);
      where.spentAt = { ...(from ? { gte: from } : {}), ...(end ? { lte: end } : {}) };
    }

    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.currency) where.currency = query.currency;
    if (query.paidById) where.paidById = query.paidById;
    if (query.method) where.method = query.method;
    if (query.search) {
      where.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { vendor: { contains: query.search, mode: 'insensitive' } },
        { externalReference: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private bodyOf(input: ExpenseRequest) {
    return {
      spentAt: fromDateOnly(input.spentAt)!,
      categoryId: input.categoryId,
      description: input.description,
      amount: input.amount,
      currency: input.currency,
      paidById: input.paidById ?? null,
      method: input.method,
      vendor: input.vendor ?? null,
      externalReference: input.externalReference ?? null,
      notes: input.notes ?? null,
    };
  }

  private async findOrFail(id: string): Promise<ExpenseWithRelations> {
    const record = await this.prisma.expense.findUnique({ where: { id }, include: expenseInclude });
    if (!record) throw new NotFoundException('That expense no longer exists.');
    return record;
  }

  private async findCategoryOrFail(id: string) {
    const category = await this.prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: { categoryId: ['That category does not exist'] },
      });
    }
    return category;
  }

  /** A duplicate name is a form problem, not a server error. */
  private categoryConflict(error: unknown, name: string): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new BadRequestException({
        message: 'Validation failed',
        details: { name: [`There is already a category called "${name}"`] },
      });
    }
    return error;
  }
}
