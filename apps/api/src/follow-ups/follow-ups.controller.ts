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
  followUpCompleteSchema,
  followUpCreateSchema,
  followUpQuerySchema,
  followUpRuleSchema,
  type FollowUp,
  type FollowUpCompleteRequest,
  type FollowUpCreateRequest,
  type FollowUpQuery,
  type FollowUpRule,
  type FollowUpRuleRequest,
} from '@travel-crm/sdk';

import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { AdminOnly } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { FollowUpsService } from './follow-ups.service';
import {
  followUpListSchema,
  followUpResponseSchema,
  followUpRuleListSchema,
  followUpRuleResponseSchema,
} from './follow-ups.schemas';

@ApiTags('follow-ups')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'follow-ups', version: '1' })
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  @ApiOperation({ summary: 'Follow-ups. An employee only sees their own.' })
  @ApiZodResponse(HttpStatus.OK, followUpListSchema, 'Follow-ups, soonest first')
  list(
    @Query(new ZodValidationPipe(followUpQuerySchema)) query: FollowUpQuery,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<FollowUp[]> {
    return this.followUps.list(query, current);
  }

  /**
   * Raise one by hand against a lead, a proposal or an invoice. Anyone who can
   * see the lead can put work on it — chasing is everybody's job.
   */
  @Post()
  @ApiOperation({ summary: 'Record a follow-up to make' })
  @ApiZodBody(followUpCreateSchema)
  @ApiZodResponse(HttpStatus.CREATED, followUpResponseSchema, 'The new follow-up')
  create(
    @Body(new ZodValidationPipe(followUpCreateSchema)) dto: FollowUpCreateRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<FollowUp> {
    return this.followUps.createManual(dto, current);
  }

  /** Declared before `:id` so "rules" is not read as a follow-up id. */
  @Get('rules')
  @AdminOnly()
  @ApiOperation({ summary: 'The configurable follow-up schedules' })
  @ApiZodResponse(HttpStatus.OK, followUpRuleListSchema, 'Rules')
  listRules(): Promise<FollowUpRule[]> {
    return this.followUps.listRules();
  }

  @Post('rules')
  @AdminOnly()
  @ApiOperation({ summary: 'Create a follow-up schedule' })
  @ApiZodBody(followUpRuleSchema)
  @ApiZodResponse(HttpStatus.CREATED, followUpRuleResponseSchema, 'The new rule')
  createRule(
    @Body(new ZodValidationPipe(followUpRuleSchema)) dto: FollowUpRuleRequest,
  ): Promise<FollowUpRule> {
    return this.followUps.saveRule(null, dto);
  }

  @Patch('rules/:id')
  @AdminOnly()
  @ApiOperation({ summary: 'Update a follow-up schedule' })
  @ApiZodBody(followUpRuleSchema)
  @ApiZodResponse(HttpStatus.OK, followUpRuleResponseSchema, 'The updated rule')
  updateRule(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(followUpRuleSchema)) dto: FollowUpRuleRequest,
  ): Promise<FollowUpRule> {
    return this.followUps.saveRule(id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record what happened. The only thing that closes one.' })
  @ApiZodBody(followUpCompleteSchema)
  @ApiZodResponse(HttpStatus.OK, followUpResponseSchema, 'The completed follow-up')
  complete(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(followUpCompleteSchema)) dto: FollowUpCompleteRequest,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<FollowUp> {
    return this.followUps.complete(id, dto, current);
  }
}
