import { HttpException, HttpStatus } from '@nestjs/common';

export type ProviderFault =
  'not_configured' | 'token_expired' | 'rate_limited' | 'rejected' | 'unreachable';

const STATUS: Record<ProviderFault, HttpStatus> = {
  not_configured: HttpStatus.SERVICE_UNAVAILABLE,
  token_expired: HttpStatus.SERVICE_UNAVAILABLE,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  rejected: HttpStatus.BAD_GATEWAY,
  unreachable: HttpStatus.BAD_GATEWAY,
};

/**
 * A failure that came from Instagram or WhatsApp rather than from us. The
 * message is written to be shown to a salesperson as-is.
 */
export class ProviderError extends HttpException {
  constructor(
    readonly fault: ProviderFault,
    message: string,
    /** Provider-side detail, logged but never returned to the client. */
    readonly detail?: string,
  ) {
    super({ message }, STATUS[fault]);
    this.name = 'ProviderError';
  }

  static notConfigured(channel: string): ProviderError {
    return new ProviderError(
      'not_configured',
      `${channel} is not connected yet. Add its credentials to the environment and restart the API.`,
    );
  }
}
