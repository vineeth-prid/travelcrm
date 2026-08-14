import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  proposalSchema,
  proposalStatusSchema,
  type Proposal,
  type ProposalRequest,
  type ProposalStatusRequest,
  type ProposalWithHistory,
  type ProposalWithPdf,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { ProposalsService } from './proposals.service';
import {
  proposalListSchema,
  proposalResponseSchema,
  proposalWithHistorySchema,
  proposalWithPdfSchema,
} from './proposals.schemas';

@ApiTags('proposals')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1' })
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get('leads/:leadId/proposals')
  @ApiOperation({ summary: 'Every proposal on a lead, newest first' })
  @ApiZodResponse(HttpStatus.OK, proposalListSchema, 'Proposals')
  listForLead(
    @Param('leadId') leadId: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Proposal[]> {
    return this.proposals.listForLead(leadId, current);
  }

  @Post('leads/:leadId/proposals')
  @ApiOperation({ summary: 'Create a proposal at version 1' })
  @ApiZodBody(proposalSchema)
  @ApiZodResponse(HttpStatus.CREATED, proposalResponseSchema, 'The new proposal')
  create(
    @Param('leadId') leadId: string,
    @Body(new ZodValidationPipe(proposalSchema)) dto: ProposalRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Proposal> {
    return this.proposals.create(leadId, dto, current);
  }

  @Get('proposals/:id')
  @ApiOperation({ summary: 'A proposal with every version it has been through' })
  @ApiZodResponse(HttpStatus.OK, proposalWithHistorySchema, 'The proposal and its history')
  get(
    @Param('id') id: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<ProposalWithHistory> {
    return this.proposals.get(id, current);
  }

  @Patch('proposals/:id')
  @ApiOperation({ summary: 'Edit the current version. Submitted proposals are immutable.' })
  @ApiZodBody(proposalSchema)
  @ApiZodResponse(HttpStatus.OK, proposalResponseSchema, 'The updated proposal')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(proposalSchema)) dto: ProposalRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Proposal> {
    return this.proposals.update(id, dto, current);
  }

  @Post('proposals/:id/versions')
  @ApiOperation({ summary: 'Add a new version, leaving earlier ones untouched' })
  @ApiZodBody(proposalSchema)
  @ApiZodResponse(HttpStatus.CREATED, proposalResponseSchema, 'The revised proposal')
  revise(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(proposalSchema)) dto: ProposalRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Proposal> {
    return this.proposals.revise(id, dto, current);
  }

  @Post('proposals/:id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Render the customer-facing PDF and store it' })
  @ApiZodResponse(HttpStatus.OK, proposalWithPdfSchema, 'The proposal and a link to its PDF')
  generate(
    @Param('id') id: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<ProposalWithPdf> {
    return this.proposals.generatePdf(id, current);
  }

  @Get('proposals/:id/versions/:version/pdf')
  @ApiOperation({ summary: "A link to a historical version's stored PDF" })
  @ApiZodResponse(HttpStatus.OK, proposalWithPdfSchema, 'A link to the stored PDF')
  versionPdf(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<ProposalWithPdf> {
    return this.proposals.versionPdf(id, version, current);
  }

  @Post('proposals/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the proposal went to the customer' })
  @ApiZodResponse(HttpStatus.OK, proposalResponseSchema, 'The submitted proposal')
  submit(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<Proposal> {
    return this.proposals.submit(id, current);
  }

  @Patch('proposals/:id/status')
  @ApiOperation({ summary: "Record the customer's response" })
  @ApiZodBody(proposalStatusSchema)
  @ApiZodResponse(HttpStatus.OK, proposalResponseSchema, 'The updated proposal')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(proposalStatusSchema)) dto: ProposalStatusRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Proposal> {
    return this.proposals.setStatus(id, dto, current);
  }
}
