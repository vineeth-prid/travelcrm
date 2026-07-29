import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { AiError } from './ai.error';

/** Every OpenAI call in the application goes through this class. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** Ask the model for a JSON object rather than prose. */
  json?: boolean;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

interface OpenAiErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  get isConfigured(): boolean {
    return this.config.get('OPENAI_API_KEY', { infer: true }).length > 0;
  }

  /** Runs a chat completion and returns the assistant's text. */
  async complete(request: CompletionRequest): Promise<string> {
    if (!this.isConfigured) {
      throw new AiError('not_configured');
    }

    const baseUrl = this.config.get('OPENAI_BASE_URL', { infer: true }).replace(/\/$/, '');
    const model = this.config.get('OPENAI_MODEL', { infer: true });
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.get('OPENAI_API_KEY', { infer: true })}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`OpenAI request failed (${model}): ${detail}`);
      throw new AiError(timedOut ? 'timeout' : 'unreachable', detail);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.toAiError(model, response.status, payload as OpenAiErrorBody | null);
    }

    const content = (payload as ChatCompletionResponse | null)?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      this.logger.error(`OpenAI returned an empty completion (${model})`);
      throw new AiError('unreadable', 'empty completion');
    }

    this.logger.log(
      JSON.stringify({ provider: 'openai', model, durationMs: Date.now() - startedAt }),
    );

    return content.trim();
  }

  private toAiError(model: string, status: number, body: OpenAiErrorBody | null): AiError {
    const detail = `HTTP ${status} ${body?.error?.code ?? ''}: ${body?.error?.message ?? 'no message'}`;
    this.logger.error(`OpenAI error (${model}): ${detail}`);

    if (status === 429) return new AiError('rate_limited', detail);
    if (status === 401 || status === 403) return new AiError('rejected', detail);
    if (status === 408 || status === 504) return new AiError('timeout', detail);
    return new AiError('unreachable', detail);
  }
}
