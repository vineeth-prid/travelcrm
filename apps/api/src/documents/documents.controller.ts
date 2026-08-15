import { Body, Controller, Get, HttpStatus, Param, Put, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  companyProfileSchema,
  documentTemplateSchema,
  type CompanyProfile,
  type CompanyProfileRequest,
  type DocumentTemplate,
  type DocumentTemplateRequest,
} from '@travel-crm/sdk';
import type { TemplateKind } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { DocumentsService } from './documents.service';
import { companyProfileResponseSchema, documentTemplateResponseSchema } from './documents.schemas';

function parseKind(value: string): TemplateKind {
  const upper = value.toUpperCase();
  if (upper !== 'PROPOSAL' && upper !== 'INVOICE') {
    throw new BadRequestException('There are two templates: proposal and invoice.');
  }
  return upper;
}

/**
 * Document settings.
 *
 * Reading is open to any signed-in user — the proposal form prefills the terms
 * from here, and a consultant has to be able to see the company address on the
 * document they are about to send. Writing is administrators only.
 */
@ApiTags('documents')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'settings', version: '1' })
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('company')
  @ApiOperation({ summary: "The agency's own details, as printed on documents" })
  @ApiZodResponse(HttpStatus.OK, companyProfileResponseSchema, 'The company profile')
  profile(): Promise<CompanyProfile> {
    return this.documents.profile();
  }

  @Put('company')
  @AdminOnly()
  @ApiOperation({ summary: 'Update the company details' })
  @ApiZodBody(companyProfileSchema)
  @ApiZodResponse(HttpStatus.OK, companyProfileResponseSchema, 'The saved profile')
  saveProfile(
    @Body(new ZodValidationPipe(companyProfileSchema)) dto: CompanyProfileRequest,
  ): Promise<CompanyProfile> {
    return this.documents.saveProfile(dto);
  }

  @Get('templates/:kind')
  @ApiOperation({ summary: 'The boilerplate for proposals or invoices' })
  @ApiZodResponse(HttpStatus.OK, documentTemplateResponseSchema, 'The template')
  template(@Param('kind') kind: string): Promise<DocumentTemplate> {
    return this.documents.template(parseKind(kind));
  }

  @Put('templates/:kind')
  @AdminOnly()
  @ApiOperation({ summary: 'Update the boilerplate' })
  @ApiZodBody(documentTemplateSchema)
  @ApiZodResponse(HttpStatus.OK, documentTemplateResponseSchema, 'The saved template')
  saveTemplate(
    @Param('kind') kind: string,
    @Body(new ZodValidationPipe(documentTemplateSchema)) dto: DocumentTemplateRequest,
  ): Promise<DocumentTemplate> {
    return this.documents.saveTemplate(parseKind(kind), dto);
  }
}
