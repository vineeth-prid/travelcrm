import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Conversation, Quote, QuoteRequest, QuoteWithPdf } from '@travel-crm/sdk';

import { ConversationsService } from '../communication/conversations.service';
import { StorageService } from '../storage/storage.service';
import { QuotePdfService } from './quote-pdf.service';
import { toQuote, type QuoteWithItems } from './quotes.mappers';
import { QuotesRepository } from './quotes.repository';

function objectKey(quote: QuoteWithItems): string {
  return `quotes/${quote.conversationId}/${quote.id}-v${quote.version}.pdf`;
}

function fileName(quote: QuoteWithItems): string {
  const safeTitle =
    quote.title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'quote';
  return `${safeTitle}-v${quote.version}.pdf`;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly repository: QuotesRepository,
    private readonly conversations: ConversationsService,
    private readonly pdf: QuotePdfService,
    private readonly storage: StorageService,
  ) {}

  async listFor(conversationId: string): Promise<Quote[]> {
    await this.conversations.getById(conversationId);
    const rows = await this.repository.findForConversation(conversationId);
    return rows.map(toQuote);
  }

  async getById(id: string): Promise<QuoteWithPdf> {
    return this.withPdfUrl(await this.findOrFail(id));
  }

  /** Creates the next version. This is also how a sent quote is "edited". */
  async create(conversationId: string, input: QuoteRequest): Promise<Quote> {
    await this.conversations.getById(conversationId);
    const version = await this.repository.nextVersion(conversationId);
    return toQuote(await this.repository.create(conversationId, version, input));
  }

  async update(id: string, input: QuoteRequest): Promise<Quote> {
    const quote = await this.findOrFail(id);
    this.assertDraft(quote);
    return toQuote(await this.repository.replace(id, input));
  }

  /**
   * Renders the PDF and stores it. A sent quote is history: its stored PDF is
   * returned untouched rather than being rebuilt.
   */
  async generatePdf(id: string): Promise<QuoteWithPdf> {
    const quote = await this.findOrFail(id);

    if (quote.status === 'SENT' && quote.pdfPath) {
      return this.withPdfUrl(quote);
    }

    const conversation = await this.conversations.getById(quote.conversationId);
    const document = await this.pdf.render(quote, {
      name: conversation.contact.name,
      phone: conversation.contact.phone,
      email: conversation.contact.email,
      destination: conversation.destination,
    });

    const key = objectKey(quote);
    await this.storage.put(key, document, 'application/pdf');
    this.logger.log(`Stored quote PDF ${key} (${document.length} bytes)`);

    return this.withPdfUrl(await this.repository.setPdfPath(id, key));
  }

  /**
   * Delivers the PDF on the conversation's channel, records the outgoing
   * message, freezes the quote and moves the lead to QUOTE_SENT. Triggered by
   * the salesperson — never automatically.
   */
  async send(id: string): Promise<QuoteWithPdf> {
    const quote = await this.findOrFail(id);
    this.assertDraft(quote);

    if (!quote.pdfPath) {
      throw new BadRequestException('Generate the PDF before sending this quote.');
    }

    const conversation = await this.conversations.getById(quote.conversationId);
    const url = await this.storage.presignedUrl(quote.pdfPath);

    // Sending first: the quote is only frozen once the customer has it.
    await this.conversations.sendDocument(quote.conversationId, {
      url,
      filename: fileName(quote),
      caption: this.caption(quote, conversation),
    });

    const sent = await this.repository.markSent(id, new Date());
    await this.conversations.markQuoteSent(quote.conversationId);

    return this.withPdfUrl(sent);
  }

  private caption(quote: QuoteWithItems, conversation: Conversation): string {
    const name = conversation.contact.name.split(' ')[0] ?? 'there';
    return `Hi ${name}, here is your quote: ${quote.title} (${quote.currency} ${quote.totalAmount.toLocaleString('en-IN')}).`;
  }

  private assertDraft(quote: QuoteWithItems): void {
    if (quote.status === 'SENT') {
      throw new BadRequestException(
        'This quote has already been sent and cannot be changed. Create a new version instead.',
      );
    }
  }

  private async withPdfUrl(quote: QuoteWithItems): Promise<QuoteWithPdf> {
    return {
      quote: toQuote(quote),
      pdfUrl: quote.pdfPath ? await this.storage.presignedUrl(quote.pdfPath) : null,
    };
  }

  private async findOrFail(id: string): Promise<QuoteWithItems> {
    const quote = await this.repository.findById(id);
    if (!quote) {
      throw new NotFoundException('That quote no longer exists.');
    }
    return quote;
  }
}
