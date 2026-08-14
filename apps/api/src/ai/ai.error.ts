import { HttpException, HttpStatus } from '@nestjs/common';

export type AiFault =
  | 'not_configured'
  | 'model_missing'
  | 'timeout'
  | 'rate_limited'
  | 'rejected'
  | 'unreadable'
  | 'unreachable';

const STATUS: Record<AiFault, HttpStatus> = {
  not_configured: HttpStatus.SERVICE_UNAVAILABLE,
  model_missing: HttpStatus.SERVICE_UNAVAILABLE,
  timeout: HttpStatus.GATEWAY_TIMEOUT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  rejected: HttpStatus.SERVICE_UNAVAILABLE,
  unreadable: HttpStatus.BAD_GATEWAY,
  unreachable: HttpStatus.BAD_GATEWAY,
};

const MESSAGES: Record<AiFault, string> = {
  not_configured:
    'The AI assistant is not switched on. Set AI_MODEL to a model the server has installed, then restart the API.',
  model_missing:
    'The AI server does not have the configured model. Check AI_MODEL against the models it has installed.',
  timeout: 'The AI assistant took too long to respond. Please try again.',
  rate_limited: 'The AI assistant is busy right now. Wait a moment and try again.',
  rejected: 'The AI server rejected the request. Check AI_API_KEY and any usage limits.',
  unreadable: 'The AI assistant returned something we could not read. Please try again.',
  unreachable: 'Could not reach the AI assistant. Check that the AI server is running.',
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
