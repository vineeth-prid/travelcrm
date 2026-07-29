import { HttpException, HttpStatus } from '@nestjs/common';

export type AiFault =
  'not_configured' | 'timeout' | 'rate_limited' | 'rejected' | 'unreadable' | 'unreachable';

const STATUS: Record<AiFault, HttpStatus> = {
  not_configured: HttpStatus.SERVICE_UNAVAILABLE,
  timeout: HttpStatus.GATEWAY_TIMEOUT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  rejected: HttpStatus.SERVICE_UNAVAILABLE,
  unreadable: HttpStatus.BAD_GATEWAY,
  unreachable: HttpStatus.BAD_GATEWAY,
};

const MESSAGES: Record<AiFault, string> = {
  not_configured:
    'The AI assistant is not connected yet. Add an OpenAI API key to the environment and restart the API.',
  timeout: 'The AI assistant took too long to respond. Please try again.',
  rate_limited: 'The AI assistant is busy right now. Wait a moment and try again.',
  rejected: 'The OpenAI account rejected the request. Check the API key and its usage limits.',
  unreadable: 'The AI assistant returned something we could not read. Please try again.',
  unreachable: 'Could not reach the AI assistant. Check your connection and try again.',
};

/**
 * A failure from the AI provider. The message is written for a salesperson;
 * the provider's own wording is logged, never returned.
 */
export class AiError extends HttpException {
  constructor(
    readonly fault: AiFault,
    /** Provider-side detail, logged only. */
    readonly detail?: string,
  ) {
    super({ message: MESSAGES[fault] }, STATUS[fault]);
    this.name = 'AiError';
  }
}
