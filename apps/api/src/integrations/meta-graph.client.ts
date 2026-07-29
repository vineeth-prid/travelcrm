import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { ProviderError } from './provider.error';

const REQUEST_TIMEOUT_MS = 10_000;

/** Meta's error envelope: `{ "error": { "message": …, "code": … } }`. */
interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

/** OAuthException — the access token is invalid, expired or revoked. */
const TOKEN_ERROR_CODES = new Set([190, 102]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/**
 * Thin HTTP client for the Meta Graph API, shared by Instagram and WhatsApp
 * (they are the same API behind different node ids). Its only real job is
 * turning Meta's error envelope into something a salesperson can act on.
 */
@Injectable()
export class MetaGraphClient {
  private readonly logger = new Logger(MetaGraphClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.get('META_GRAPH_VERSION', { infer: true })}`;
  }

  async post<T>(channel: string, path: string, body: unknown, accessToken: string): Promise<T> {
    return this.send<T>(channel, path, accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async get<T>(channel: string, path: string, accessToken: string): Promise<T> {
    return this.send<T>(channel, path, accessToken, { method: 'GET' });
  }

  private async send<T>(
    channel: string,
    path: string,
    accessToken: string,
    init: RequestInit,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
      });
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.logger.error(`${channel}: request to ${path} failed — ${detail}`);
      throw new ProviderError(
        'unreachable',
        `Could not reach ${channel}. Check your connection and try again.`,
        detail,
      );
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw this.toProviderError(channel, response.status, payload as GraphErrorBody | null);
    }

    return payload as T;
  }

  private toProviderError(
    channel: string,
    status: number,
    body: GraphErrorBody | null,
  ): ProviderError {
    const error = body?.error;
    const detail = `HTTP ${status} code=${error?.code ?? '?'} subcode=${error?.error_subcode ?? '?'}: ${error?.message ?? 'no message'}`;
    this.logger.error(`${channel}: ${detail}`);

    if (error?.code !== undefined && TOKEN_ERROR_CODES.has(error.code)) {
      return new ProviderError(
        'token_expired',
        `The ${channel} connection has expired. Reconnect the account and update its access token.`,
        detail,
      );
    }

    if (status === 429 || (error?.code !== undefined && RATE_LIMIT_CODES.has(error.code))) {
      return new ProviderError(
        'rate_limited',
        `${channel} is rate limiting us. Wait a moment and send again.`,
        detail,
      );
    }

    return new ProviderError(
      'rejected',
      `${channel} rejected the message. It may be outside the allowed reply window.`,
      detail,
    );
  }
}
