import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  aiRequestSchema,
  extractedDetailsSchema,
  type AiRequest,
  type ConversationSummary,
  type ExtractedDetails,
  type SuggestedReply,
} from '@travel-crm/sdk';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import { AiService } from './ai.service';

const summarySchema = z.object({ summary: z.string() });
const replySchema = z.object({ reply: z.string() });

/**
 * Assistive endpoints. Each one is triggered by the salesperson and returns a
 * draft: nothing here saves a field or sends a message.
 */
@ApiTags('ai')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
// AI calls cost money and take seconds; keep a lid on accidental hammering.
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Summarise a conversation for the salesperson' })
  @ApiZodBody(aiRequestSchema)
  @ApiZodResponse(HttpStatus.OK, summarySchema, 'A plain-text summary')
  summarise(
    @Body(new ZodValidationPipe(aiRequestSchema)) dto: AiRequest,
  ): Promise<ConversationSummary> {
    return this.ai.summarise(dto.conversationId);
  }

  @Post('extract')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract travel details for review (never saved automatically)' })
  @ApiZodBody(aiRequestSchema)
  @ApiZodResponse(HttpStatus.OK, extractedDetailsSchema, 'Details, with null for anything unstated')
  extract(@Body(new ZodValidationPipe(aiRequestSchema)) dto: AiRequest): Promise<ExtractedDetails> {
    return this.ai.extract(dto.conversationId);
  }

  @Post('reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Draft a reply for the composer (never sent automatically)' })
  @ApiZodBody(aiRequestSchema)
  @ApiZodResponse(HttpStatus.OK, replySchema, 'A plain-text draft reply')
  reply(@Body(new ZodValidationPipe(aiRequestSchema)) dto: AiRequest): Promise<SuggestedReply> {
    return this.ai.suggestReply(dto.conversationId);
  }
}
