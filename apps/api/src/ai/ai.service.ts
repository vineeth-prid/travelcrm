import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  Conversation,
  ConversationSummary,
  ExtractedDetails,
  Message,
  SuggestedReply,
} from '@travel-crm/sdk';

import { ConversationsService } from '../communication/conversations.service';
import { AiError } from './ai.error';
import { parseExtraction } from './extraction.parser';
import { OpenAiClient } from './openai.client';
import { buildExtractPrompt } from './prompts/extract.prompt';
import { buildReplyPrompt } from './prompts/reply.prompt';
import { buildSummaryPrompt } from './prompts/summary.prompt';
import { buildTranscript } from './transcript';

/**
 * The three assistive actions. Each one is triggered by a salesperson, returns
 * a draft for them to review, and writes nothing — saving and sending stay
 * explicit actions in the inbox.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly openai: OpenAiClient,
    private readonly conversations: ConversationsService,
  ) {}

  async summarise(conversationId: string): Promise<ConversationSummary> {
    const { transcript } = await this.load(conversationId);
    const summary = await this.openai.complete(buildSummaryPrompt(transcript));
    return { summary };
  }

  async extract(conversationId: string): Promise<ExtractedDetails> {
    const { transcript } = await this.load(conversationId);
    const raw = await this.openai.complete(buildExtractPrompt(transcript));

    const details = parseExtraction(raw);
    if (!details) {
      throw new AiError('unreadable', `unparseable extraction: ${raw.slice(0, 200)}`);
    }

    return details;
  }

  async suggestReply(conversationId: string): Promise<SuggestedReply> {
    const { transcript, conversation } = await this.load(conversationId);

    const reply = await this.openai.complete(
      buildReplyPrompt(transcript, {
        destination: conversation.destination,
        travelMonth: conversation.travelMonth,
        adults: conversation.adults,
        children: conversation.children,
        budget: conversation.budget,
      }),
    );

    return { reply };
  }

  /** Loads exactly what the prompts need. Missing conversations 404 here. */
  private async load(
    conversationId: string,
  ): Promise<{ conversation: Conversation; messages: Message[]; transcript: string }> {
    const conversation = await this.conversations.getById(conversationId);
    const messages = await this.conversations.messages(conversationId);

    if (messages.length === 0) {
      throw new BadRequestException('There are no messages to work from yet.');
    }

    return { conversation, messages, transcript: buildTranscript(messages) };
  }
}
