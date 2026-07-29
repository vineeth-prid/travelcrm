import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { quoteSchema, type Quote, type QuoteRequest, type QuoteWithPdf } from '@travel-crm/sdk';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { quoteListSchema, quoteResponseSchema, quoteWithPdfSchema } from './quotes.schemas';
import { QuotesService } from './quotes.service';

@ApiTags('quotes')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ version: '1' })
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get('conversations/:conversationId/quotes')
  @ApiOperation({ summary: 'Quote history for a conversation, newest version first' })
  @ApiZodResponse(HttpStatus.OK, quoteListSchema, 'Quotes')
  list(@Param('conversationId') conversationId: string): Promise<Quote[]> {
    return this.quotes.listFor(conversationId);
  }

  @Post('conversations/:conversationId/quotes')
  @ApiOperation({ summary: 'Create the next quote version (this is how a sent quote is edited)' })
  @ApiZodBody(quoteSchema)
  @ApiZodResponse(HttpStatus.CREATED, quoteResponseSchema, 'The new draft')
  create(
    @Param('conversationId') conversationId: string,
    @Body(new ZodValidationPipe(quoteSchema)) dto: QuoteRequest,
  ): Promise<Quote> {
    return this.quotes.create(conversationId, dto);
  }

  @Get('quotes/:id')
  @ApiOperation({ summary: 'A single quote, with a link to its PDF if one exists' })
  @ApiZodResponse(HttpStatus.OK, quoteWithPdfSchema, 'The quote')
  get(@Param('id') id: string): Promise<QuoteWithPdf> {
    return this.quotes.getById(id);
  }

  @Patch('quotes/:id')
  @ApiOperation({ summary: 'Update a draft quote. Sent quotes are immutable.' })
  @ApiZodBody(quoteSchema)
  @ApiZodResponse(HttpStatus.OK, quoteResponseSchema, 'The updated draft')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quoteSchema)) dto: QuoteRequest,
  ): Promise<Quote> {
    return this.quotes.update(id, dto);
  }

  @Post('quotes/:id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Render the PDF and store it' })
  @ApiZodResponse(HttpStatus.OK, quoteWithPdfSchema, 'The quote and a link to its PDF')
  generate(@Param('id') id: string): Promise<QuoteWithPdf> {
    return this.quotes.generatePdf(id);
  }

  @Post('quotes/:id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Send the PDF on the conversation's channel and freeze the quote" })
  @ApiZodResponse(HttpStatus.OK, quoteWithPdfSchema, 'The sent quote')
  send(@Param('id') id: string): Promise<QuoteWithPdf> {
    return this.quotes.send(id);
  }
}
