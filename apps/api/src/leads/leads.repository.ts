import { Injectable } from '@nestjs/common';
import type { Customer, LeadStage, LostReason, Prisma } from '@prisma/client';
import type { LeadQuery, LeadRequest } from '@travel-crm/sdk';

import { PrismaService } from '../shared/prisma.service';
import { fromDateOnly, leadInclude, type LeadWithRelations } from './leads.mappers';

export const DEFAULT_PAGE_SIZE = 25;

/** Phone numbers are typed inconsistently; compare them without the noise. */
export function normalisePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 0 ? null : digits;
}

/**
 * The form a number is *stored* in. "+91 98765 43210" and "9876543210" are the
 * same person, so both are kept as digits with the country code's plus sign
 * preserved. Normalising on the way in is what lets duplicate detection use an
 * indexed `contains` instead of scanning and normalising every row on the way
 * out. Presentation formatting is the interface's job.
 */
export function toStoredPhone(value: string | null | undefined): string | null {
  const digits = normalisePhone(value);
  if (!digits) return null;
  return value?.trim().startsWith('+') ? `+${digits}` : digits;
}

/**
 * The rows an actor is allowed to see. An employee sees the leads assigned to
 * them and the ones they created; an admin sees everything. Every read goes
 * through this, so there is no route that can accidentally leak the pipeline.
 */
export function scopeFor(actor: { id: string; role: string }): Prisma.LeadWhereInput {
  if (actor.role === 'ADMIN') return {};
  return { OR: [{ assignedToId: actor.id }, { createdById: actor.id }] };
}

function filtersFrom(query: LeadQuery): Prisma.LeadWhereInput[] {
  const where: Prisma.LeadWhereInput[] = [];

  if (query.search) {
    const search = query.search.trim();
    const digits = normalisePhone(search);
    where.push({
      OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { destination: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        // Falls back to a literal match when the search term has no digits.
        { customer: { phone: { contains: digits ?? search } } },
        { customer: { whatsapp: { contains: digits ?? search } } },
      ],
    });
  }

  if (query.stage) where.push({ stage: query.stage });
  if (query.source) where.push({ source: query.source });
  if (query.priority) where.push({ priority: query.priority });
  if (query.assignedToId) where.push({ assignedToId: query.assignedToId });
  if (query.destination) {
    where.push({ destination: { contains: query.destination, mode: 'insensitive' } });
  }
  if (query.createdFrom) where.push({ createdAt: { gte: fromDateOnly(query.createdFrom)! } });
  if (query.createdTo) {
    // Inclusive of the whole day the consultant picked.
    const end = fromDateOnly(query.createdTo)!;
    end.setUTCDate(end.getUTCDate() + 1);
    where.push({ createdAt: { lt: end } });
  }

  // A booked enquiry belongs to the customer book, not the pipeline. It is
  // hidden rather than deleted: `includeConverted` brings it back, and every
  // filtered view (a stage filter, a search) still finds it, because somebody
  // looking for a specific lead means it.
  if (!query.includeConverted && !query.stage && !query.search) {
    where.push({ customer: { convertedAt: null } });
  }

  if (query.overdue) {
    where.push({
      nextFollowUpAt: { lt: new Date() },
      stage: { notIn: ['WON', 'LOST'] },
    });
  }

  return where;
}

/**
 * How each sortable column is ordered.
 *
 * Written out per column rather than built from a computed key, because
 * `nulls: 'last'` is only legal on a **nullable** column — Prisma rejects it
 * at runtime on `createdAt`, and a computed key hides that from the compiler.
 * With the map, `tsc` refuses the invalid combination.
 */
const ORDER_BY: Record<
  NonNullable<LeadQuery['sort']>,
  (direction: Prisma.SortOrder) => Prisma.LeadOrderByWithRelationInput
> = {
  createdAt: (direction) => ({ createdAt: direction }),
  lastActivityAt: (direction) => ({ lastActivityAt: direction }),
  // Nullable, and a lead with no date should never displace one that has a
  // real date to act on.
  nextFollowUpAt: (direction) => ({ nextFollowUpAt: { sort: direction, nulls: 'last' } }),
  budget: (direction) => ({ budget: { sort: direction, nulls: 'last' } }),
};

@Injectable()
export class LeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: LeadQuery,
    scope: Prisma.LeadWhereInput,
  ): Promise<{ rows: LeadWithRelations[]; total: number }> {
    const where: Prisma.LeadWhereInput = { AND: [scope, ...filtersFrom(query)] };
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const sort = query.sort ?? 'createdAt';
    const direction = query.direction ?? 'desc';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: leadInclude,
        orderBy: ORDER_BY[sort](direction),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { rows, total };
  }

  findById(id: string): Promise<LeadWithRelations | null> {
    return this.prisma.lead.findUnique({ where: { id }, include: leadInclude });
  }

  /**
   * Customers who share a phone, WhatsApp number or email with what is being
   * typed. Phone comparison ignores formatting, so "+91 98765 43210" and
   * "9876543210" find each other.
   */
  async findDuplicateCustomers(input: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  }): Promise<(Customer & { leads: { reference: string; stage: string }[] })[]> {
    const phone = normalisePhone(input.phone);
    const whatsapp = normalisePhone(input.whatsapp);
    const email = input.email?.trim().toLowerCase() || null;

    const numbers = [phone, whatsapp].filter((value): value is string => value !== null);
    const or: Prisma.CustomerWhereInput[] = [];

    for (const number of numbers) {
      // Last 10 digits: the same subscriber written with and without a country
      // code must still collide.
      const tail = number.slice(-10);
      or.push({ phone: { contains: tail } }, { whatsapp: { contains: tail } });
    }
    if (email) or.push({ email: { equals: email, mode: 'insensitive' } });

    if (or.length === 0) return [];

    return this.prisma.customer.findMany({
      where: { OR: or },
      include: {
        leads: {
          select: { reference: true, stage: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      take: 10,
    });
  }

  /**
   * Creates the lead, its customer if it is somebody new, and the opening
   * timeline entry — in one transaction, so a half-made lead cannot exist.
   */
  async create(
    input: LeadRequest,
    actorId: string,
    assignedToId: string | null,
  ): Promise<LeadWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const customerId =
        input.customerId ??
        (
          await tx.customer.create({
            data: {
              name: input.customerName,
              phone: toStoredPhone(input.phone),
              whatsapp: toStoredPhone(input.whatsapp),
              email: input.email ?? null,
              preferredContact: input.preferredContact ?? null,
              city: input.city ?? null,
              country: input.country ?? null,
            },
          })
        ).id;

      // An existing customer's details are refreshed from what was just typed,
      // but never blanked by a field the consultant left empty.
      if (input.customerId) {
        await tx.customer.update({
          where: { id: input.customerId },
          data: {
            name: input.customerName,
            ...(input.phone ? { phone: toStoredPhone(input.phone) } : {}),
            ...(input.whatsapp ? { whatsapp: toStoredPhone(input.whatsapp) } : {}),
            ...(input.email ? { email: input.email } : {}),
            ...(input.preferredContact ? { preferredContact: input.preferredContact } : {}),
            ...(input.city ? { city: input.city } : {}),
            ...(input.country ? { country: input.country } : {}),
          },
        });
      }

      return tx.lead.create({
        data: {
          customerId,
          ...requirementData(input),
          source: input.source ?? 'MANUAL',
          priority: input.priority ?? 'MEDIUM',
          tags: input.tags ?? [],
          assignedToId,
          createdById: actorId,
          nextAction: input.nextAction ?? null,
          nextFollowUpAt: fromDateOnly(input.nextFollowUpAt),
          notes: input.notes ?? null,
        },
        include: leadInclude,
      });
    });
  }

  /** Replaces the editable body of a lead. Stage and assignment are not here. */
  async update(id: string, input: LeadRequest): Promise<LeadWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUniqueOrThrow({ where: { id }, select: { customerId: true } });

      await tx.customer.update({
        where: { id: lead.customerId },
        data: {
          name: input.customerName,
          phone: toStoredPhone(input.phone),
          whatsapp: toStoredPhone(input.whatsapp),
          email: input.email ?? null,
          preferredContact: input.preferredContact ?? null,
          city: input.city ?? null,
          country: input.country ?? null,
        },
      });

      return tx.lead.update({
        where: { id },
        data: {
          ...requirementData(input),
          source: input.source ?? 'MANUAL',
          priority: input.priority ?? 'MEDIUM',
          tags: input.tags ?? [],
          nextAction: input.nextAction ?? null,
          nextFollowUpAt: fromDateOnly(input.nextFollowUpAt),
          notes: input.notes ?? null,
        },
        include: leadInclude,
      });
    });
  }

  setStage(
    id: string,
    data: { stage: LeadStage; lostReason: LostReason | null; lostNotes: string | null },
  ): Promise<LeadWithRelations> {
    return this.prisma.lead.update({ where: { id }, data, include: leadInclude });
  }

  setAssignee(id: string, assignedToId: string | null): Promise<LeadWithRelations> {
    return this.prisma.lead.update({ where: { id }, data: { assignedToId }, include: leadInclude });
  }

  /**
   * Advances a lead's stage as a side effect of something else happening —
   * a proposal being sent, an invoice being raised.
   *
   * Refuses to touch a lead that is already WON or LOST. Without that guard,
   * regenerating a document on a closed deal would quietly reopen it, and the
   * pipeline would start counting won business as still in play.
   */
  /** Keeps the lead list's "next follow-up" column honest. */
  async setNextFollowUp(id: string, nextFollowUpAt: Date | null): Promise<void> {
    await this.prisma.lead.update({ where: { id }, data: { nextFollowUpAt } });
  }

  async setStageIfOpen(id: string, stage: LeadStage): Promise<void> {
    await this.prisma.lead.updateMany({
      where: { id, stage: { notIn: ['WON', 'LOST'] } },
      data: { stage },
    });
  }
}

/** The travel-requirement half of a lead, shared by create and update. */
function requirementData(input: LeadRequest) {
  return {
    destination: input.destination ?? null,
    departureCity: input.departureCity ?? null,
    travelStart: fromDateOnly(input.travelStart),
    travelEnd: fromDateOnly(input.travelEnd),
    adults: input.adults ?? null,
    children: input.children ?? null,
    childAges: input.childAges ?? [],
    tripType: input.tripType ?? null,
    hotelCategory: input.hotelCategory ?? null,
    mealPreference: input.mealPreference ?? null,
    transportRequired: input.transportRequired ?? false,
    flightRequired: input.flightRequired ?? false,
    activityRequirements: input.activityRequirements ?? null,
    specialRequirements: input.specialRequirements ?? null,
    budget: input.budget ?? null,
    currency: input.currency ?? 'INR',
    rawRequirement: input.rawRequirement ?? null,
    requirementSummary: input.requirementSummary ?? null,
  };
}
