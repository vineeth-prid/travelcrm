import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  sendMessageSchema,
  updateConversationSchema,
  type Conversation,
  type InboxEvent,
  type Message,
  type SendMessageRequest,
  type UpdateConversationRequest,
} from '@travel-crm/sdk';
import { map, merge, type Observable } from 'rxjs';
import { interval } from 'rxjs';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiZodBody, ApiZodResponse, ZodValidationPipe } from '../shared/zod';
import {
  conversationListSchema,
  conversationSchema,
  messageListSchema,
  messageSchema,
} from './communication.schemas';
import { ConversationsService } from './conversations.service';
import { InboxEventsService } from './inbox-events.service';

/** Keeps proxies from closing an idle event stream. */
const HEARTBEAT_MS = 25_000;

@ApiTags('conversations')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'conversations', version: '1' })
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly events: InboxEventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List conversations, most recently active first' })
  @ApiQuery({ name: 'search', required: false, description: 'Match on contact name or phone' })
  @ApiZodResponse(HttpStatus.OK, conversationListSchema, 'Conversations')
  list(@Query('search') search?: string): Promise<Conversation[]> {
    return this.conversations.list(search);
  }

  /**
   * Declared before `:id` so the literal path wins the route match.
   * Live inbox updates over Server-Sent Events — the browser's EventSource
   * sends the session cookie, so the guard above still applies.
   */
  @Sse('events')
  @ApiOperation({ summary: 'Server-Sent Events stream of inbox updates' })
  stream(): Observable<{ data: InboxEvent | { type: 'ping' } }> {
    return merge(
      this.events.stream.pipe(map((event) => ({ data: event }))),
      interval(HEARTBEAT_MS).pipe(map(() => ({ data: { type: 'ping' as const } }))),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Open a conversation, clearing its unread count' })
  @ApiZodResponse(HttpStatus.OK, conversationSchema, 'The conversation')
  get(@Param('id') id: string): Promise<Conversation> {
    return this.conversations.openById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Save the lead details captured beside the conversation' })
  @ApiZodBody(updateConversationSchema)
  @ApiZodResponse(HttpStatus.OK, conversationSchema, 'The updated conversation')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConversationSchema)) dto: UpdateConversationRequest,
  ): Promise<Conversation> {
    return this.conversations.updateDetails(id, dto);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Full message history, oldest first' })
  @ApiZodResponse(HttpStatus.OK, messageListSchema, 'Messages')
  messages(@Param('id') id: string): Promise<Message[]> {
    return this.conversations.messages(id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a text reply on the conversation’s channel' })
  @ApiZodBody(sendMessageSchema)
  @ApiZodResponse(HttpStatus.CREATED, messageSchema, 'The sent message')
  send(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) dto: SendMessageRequest,
  ): Promise<Message> {
    return this.conversations.sendMessage(id, dto.content);
  }
}
