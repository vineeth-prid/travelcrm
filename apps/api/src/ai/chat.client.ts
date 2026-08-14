import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { AiError } from './ai.error';

/**
 * Every AI call in the application goes through this class.
 *
 * It speaks the OpenAI chat-completions protocol, which is what Ollama serves
 * on `/v1` — so the same client covers a local Ollama server and any
 * OpenAI-compatible gateway. Which one it talks to is entirely configuration:
 * no host and no model name is hardcoded anywhere.
 */
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

interface ProviderErrorBody {
  error?: { message?: string; type?: string; code?: string };
}

/** Ollama's own model listing, which is not part of the OpenAI protocol. */
interface OllamaTagsResponse {
  models?: { name?: string }[];
}

export interface AiStatus {
  /** True once a model has been named in the environment. */
  configured: boolean;
  baseUrl: string;
  model: string;
  /** Models the server reports as installed, or null if it could not be asked. */
  availableModels: string[] | null;
  reachable: boolean;
}

@Injectable()
export class ChatClient {
  private readonly logger = new Logger(ChatClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  private get baseUrl(): string {
    return this.config.get('AI_BASE_URL', { infer: true }).replace(/\/$/, '');
  }

  private get model(): string {
    return this.config.get('AI_MODEL', { infer: true });
  }

  /**
   * Configured means "we have been told which model to use". There is
   * deliberately no default: guessing a model name that is not installed fails
   * at the worst possible moment, with a confusing error.
   */
  get isConfigured(): boolean {
    return this.model.length > 0;
  }

  /** Runs a chat completion and returns the assistant's text. */
  async complete(request: CompletionRequest): Promise<string> {
    if (!this.isConfigured) {
      throw new AiError('not_configured');
    }

    const { baseUrl, model } = this;
    const apiKey = this.config.get('AI_API_KEY', { infer: true });
    const timeout = this.config.get('AI_TIMEOUT_MS', { infer: true });
    const startedAt = Date.now();

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeout),
        headers: {
          'Content-Type': 'application/json',
          // Ollama ignores this; a hosted gateway needs it.
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
      this.logger.error(`AI request failed (${model}): ${detail}`);
      throw new AiError(timedOut ? 'timeout' : 'unreachable', detail);
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.toAiError(model, response.status, payload as ProviderErrorBody | null);
    }

    const content = (payload as ChatCompletionResponse | null)?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      this.logger.error(`AI returned an empty completion (${model})`);
      throw new AiError('unreadable', 'empty completion');
    }

    this.logger.log(JSON.stringify({ model, durationMs: Date.now() - startedAt }));

    return content.trim();
  }

  /**
   * What the server actually has installed, so an administrator can see which
   * name to put in AI_MODEL rather than guessing. Ollama-specific: `/api/tags`
   * sits at the server root, beside the `/v1` OpenAI-compatible surface.
   */
  async status(): Promise<AiStatus> {
    const { baseUrl, model } = this;
    const root = baseUrl.replace(/\/v\d+$/, '');

    try {
      const response = await fetch(`${root}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });

      if (!response.ok) {
        return {
          configured: this.isConfigured,
          baseUrl,
          model,
          availableModels: null,
          reachable: false,
        };
      }

      const payload = (await response.json()) as OllamaTagsResponse;
      const models = (payload.models ?? [])
        .map((entry) => entry.name)
        .filter((name): name is string => typeof name === 'string');

      return {
        configured: this.isConfigured,
        baseUrl,
        model,
        availableModels: models,
        reachable: true,
      };
    } catch (cause) {
      // A gateway that is not Ollama has no /api/tags. That is not an error —
      // it just means the model list cannot be discovered from here.
      this.logger.debug(`Could not list models: ${cause instanceof Error ? cause.message : ''}`);
      return {
        configured: this.isConfigured,
        baseUrl,
        model,
        availableModels: null,
        reachable: false,
      };
    }
  }

  private toAiError(model: string, status: number, body: ProviderErrorBody | null): AiError {
    const detail = `HTTP ${status} ${body?.error?.code ?? ''}: ${body?.error?.message ?? 'no message'}`;
    this.logger.error(`AI error (${model}): ${detail}`);

    if (status === 429) return new AiError('rate_limited', detail);
    if (status === 401 || status === 403) return new AiError('rejected', detail);
    if (status === 408 || status === 504) return new AiError('timeout', detail);
    // A model name the server does not have comes back as a 404.
    if (status === 404) return new AiError('model_missing', detail);
    return new AiError('unreachable', detail);
  }
}
