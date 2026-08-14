import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  invoiceQuerySchema,
  invoiceSchema,
  paymentSchema,
  type Invoice,
  type InvoiceQuery,
  type InvoiceRequest,
  type InvoiceWithPdf,
  type PaymentRequest,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { InvoicesService } from './invoices.service';
import { invoiceListSchema, invoiceResponseSchema, invoiceWithPdfSchema } from './invoices.schemas';

@ApiTags('invoices')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1' })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get('invoices')
  @ApiOperation({ summary: 'Invoices. An employee only sees those on their own leads.' })
  @ApiZodResponse(HttpStatus.OK, invoiceListSchema, 'Invoices, newest first')
  list(
    @Query(new ZodValidationPipe(invoiceQuerySchema)) query: InvoiceQuery,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Invoice[]> {
    return this.invoices.list(query, current);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'One invoice, with its payments' })
  @ApiZodResponse(HttpStatus.OK, invoiceResponseSchema, 'The invoice')
  get(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<Invoice> {
    return this.invoices.get(id, current);
  }

  @Post('leads/:leadId/invoices')
  @ApiOperation({ summary: 'Raise an invoice against a lead' })
  @ApiZodBody(invoiceSchema)
  @ApiZodResponse(HttpStatus.CREATED, invoiceResponseSchema, 'The new invoice')
  create(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(invoiceSchema)) dto: InvoiceRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Invoice> {
    return this.invoices.create(leadId, dto, current);
  }

  @Patch('invoices/:id')
  @ApiOperation({ summary: 'Edit a draft. Issued invoices are immutable.' })
  @ApiZodBody(invoiceSchema)
  @ApiZodResponse(HttpStatus.OK, invoiceResponseSchema, 'The updated invoice')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(invoiceSchema)) dto: InvoiceRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Invoice> {
    return this.invoices.update(id, dto, current);
  }

  @Post('invoices/:id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Render the customer-facing PDF and store it' })
  @ApiZodResponse(HttpStatus.OK, invoiceWithPdfSchema, 'The invoice and a link to its PDF')
  generate(
    @Param('id') id: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<InvoiceWithPdf> {
    return this.invoices.generatePdf(id, current);
  }

  @Post('invoices/:id/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue the invoice — it stops being editable' })
  @ApiZodResponse(HttpStatus.OK, invoiceResponseSchema, 'The issued invoice')
  issue(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<Invoice> {
    return this.invoices.issue(id, current);
  }

  @Post('invoices/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an invoice. Refused once it has payments.' })
  @ApiZodResponse(HttpStatus.OK, invoiceResponseSchema, 'The cancelled invoice')
  cancel(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<Invoice> {
    return this.invoices.cancel(id, current);
  }

  @Post('invoices/:id/payments')
  @ApiOperation({ summary: 'Record money received against the invoice' })
  @ApiZodBody(paymentSchema)
  @ApiZodResponse(HttpStatus.CREATED, invoiceResponseSchema, 'The invoice, with the new payment')
  recordPayment(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(paymentSchema)) dto: PaymentRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Invoice> {
    return this.invoices.recordPayment(id, dto, current);
  }
}
