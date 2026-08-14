import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  leadAssignSchema,
  leadNoteSchema,
  leadQuerySchema,
  leadSchema,
  leadStageSchema,
  type DuplicateCheck,
  type Lead,
  type LeadActivity,
  type LeadAssignRequest,
  type LeadNoteRequest,
  type LeadQuery,
  type LeadPage,
  type LeadRequest,
  type LeadStageRequest,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { LeadsService } from './leads.service';
import {
  duplicateCheckSchema,
  leadActivityListSchema,
  leadActivitySchema,
  leadPageSchema,
  leadResponseSchema,
} from './leads.schemas';

const duplicateQuerySchema = z.object({
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  email: z.string().trim().optional(),
});

const createQuerySchema = z.object({
  /** Set once the consultant has seen the duplicate warning and chosen to go on. */
  allowDuplicate: z.coerce.boolean().optional(),
});

@ApiTags('leads')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'leads', version: '1' })
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Search the pipeline. An employee only ever sees their own leads.' })
  @ApiZodResponse(HttpStatus.OK, leadPageSchema, 'A page of leads')
  list(
    @Query(new ZodValidationPipe(leadQuerySchema)) query: LeadQuery,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<LeadPage> {
    return this.leads.list(query, current);
  }

  /** Declared before `:id` so "duplicates" is not read as a lead id. */
  @Get('duplicates')
  @ApiOperation({ summary: 'Customers already on file with these contact details' })
  @ApiZodResponse(HttpStatus.OK, duplicateCheckSchema, 'Possible duplicates')
  duplicates(
    @Query(new ZodValidationPipe(duplicateQuerySchema))
    query: z.infer<typeof duplicateQuerySchema>,
  ): Promise<DuplicateCheck> {
    return this.leads.duplicates(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'A single lead' })
  @ApiZodResponse(HttpStatus.OK, leadResponseSchema, 'The lead')
  get(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<Lead> {
    return this.leads.get(id, current);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a lead. 409 when the customer looks like somebody already on file.',
  })
  @ApiZodBody(leadSchema)
  @ApiZodResponse(HttpStatus.CREATED, leadResponseSchema, 'The new lead')
  create(
    @Body(new ZodValidationPipe(leadSchema)) dto: LeadRequest,
    @Query(new ZodValidationPipe(createQuerySchema)) query: z.infer<typeof createQuerySchema>,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leads.create(dto, current, query.allowDuplicate ?? false);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update the customer and travel requirements' })
  @ApiZodBody(leadSchema)
  @ApiZodResponse(HttpStatus.OK, leadResponseSchema, 'The updated lead')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadSchema)) dto: LeadRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leads.update(id, dto, current);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move the lead along the pipeline. LOST requires a reason.' })
  @ApiZodBody(leadStageSchema)
  @ApiZodResponse(HttpStatus.OK, leadResponseSchema, 'The updated lead')
  changeStage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadStageSchema)) dto: LeadStageRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leads.changeStage(id, dto, current);
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Reassign the lead. An employee may only take it themselves.' })
  @ApiZodBody(leadAssignSchema)
  @ApiZodResponse(HttpStatus.OK, leadResponseSchema, 'The updated lead')
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadAssignSchema)) dto: LeadAssignRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<Lead> {
    return this.leads.assign(id, dto, current);
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'The lead timeline, newest first' })
  @ApiZodResponse(HttpStatus.OK, leadActivityListSchema, 'Timeline entries')
  activities(
    @Param('id') id: string,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<LeadActivity[]> {
    return this.leads.activityFeed(id, current);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Add a note to the timeline' })
  @ApiZodBody(leadNoteSchema)
  @ApiZodResponse(HttpStatus.CREATED, leadActivitySchema, 'The new entry')
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(leadNoteSchema)) dto: LeadNoteRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<LeadActivity> {
    return this.leads.addNote(id, dto, current);
  }
}
