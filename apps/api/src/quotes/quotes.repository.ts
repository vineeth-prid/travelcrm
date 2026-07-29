import { Injectable } from '@nestjs/common';
import type { QuoteRequest } from '@travel-crm/sdk';

import { PrismaService } from '../shared/prisma.service';
import type { QuoteWithItems } from './quotes.mappers';

/** quantity × unitPrice per line, summed for the quote. Never trusted from the client. */
export function priceItems(items: QuoteRequest['items']) {
  const priced = items.map((item, index) => ({
    title: item.title,
    description: item.description ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
    sortOrder: index,
  }));

  return { priced, totalAmount: priced.reduce((sum, item) => sum + item.totalPrice, 0) };
}

const withItems = { items: { orderBy: { sortOrder: 'asc' } } } as const;

@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findForConversation(conversationId: string): Promise<QuoteWithItems[]> {
    return this.prisma.quote.findMany({
      where: { conversationId },
      include: withItems,
      orderBy: { version: 'desc' },
    });
  }

  findById(id: string): Promise<QuoteWithItems | null> {
    return this.prisma.quote.findUnique({ where: { id }, include: withItems });
  }

  /** Next version number for a conversation, starting at 1. */
  async nextVersion(conversationId: string): Promise<number> {
    const latest = await this.prisma.quote.findFirst({
      where: { conversationId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }

  async create(
    conversationId: string,
    version: number,
    input: QuoteRequest,
  ): Promise<QuoteWithItems> {
    const { priced, totalAmount } = priceItems(input.items);

    return this.prisma.quote.create({
      data: {
        conversationId,
        version,
        title: input.title,
        currency: input.currency,
        validUntil: new Date(input.validUntil),
        notes: input.notes ?? null,
        totalAmount,
        items: { create: priced },
      },
      include: withItems,
    });
  }

  /** Replaces the whole quote body. Only ever called on drafts. */
  async replace(id: string, input: QuoteRequest): Promise<QuoteWithItems> {
    const { priced, totalAmount } = priceItems(input.items);

    return this.prisma.$transaction(async (tx) => {
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });

      return tx.quote.update({
        where: { id },
        data: {
          title: input.title,
          currency: input.currency,
          validUntil: new Date(input.validUntil),
          notes: input.notes ?? null,
          totalAmount,
          // A change invalidates any PDF generated from the previous body.
          pdfPath: null,
          items: { create: priced },
        },
        include: withItems,
      });
    });
  }

  async setPdfPath(id: string, pdfPath: string): Promise<QuoteWithItems> {
    return this.prisma.quote.update({ where: { id }, data: { pdfPath }, include: withItems });
  }

  async markSent(id: string, sentAt: Date): Promise<QuoteWithItems> {
    return this.prisma.quote.update({
      where: { id },
      data: { status: 'SENT', sentAt },
      include: withItems,
    });
  }
}
