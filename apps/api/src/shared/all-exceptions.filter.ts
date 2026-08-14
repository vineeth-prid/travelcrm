import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiErrorBody } from '@travel-crm/sdk';
import type { Request, Response } from 'express';

import { AuditRecorder } from '../audit/audit.recorder';

interface Normalized {
  status: number;
  message: string;
  details?: Record<string, string[]>;
}

function normalize(exception: unknown): Normalized {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return { status, message: body };
    }

    const record = body as { message?: string | string[]; details?: Record<string, string[]> };
    const message = Array.isArray(record.message)
      ? (record.message[0] ?? exception.message)
      : (record.message ?? exception.message);

    return { status, message, details: record.details };
  }

  // Unique constraint violations are the only Prisma error a client can act on.
  if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
    return { status: HttpStatus.CONFLICT, message: 'That value is already taken.' };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Something went wrong. Please try again.',
  };
}

/**
 * Converts every thrown value into the single error shape the SDK expects.
 *
 * Also the only place that sees a request a **guard** rejected — guards run
 * before interceptors — so this is where refused attempts reach the audit
 * trail. Without it, 401, 403 and 429 would be missing from it entirely.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly audit?: AuditRecorder) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const { status, message, details } = normalize(exception);

    const body: ApiErrorBody = {
      statusCode: status,
      message,
      error: HttpStatus[status] ?? 'ERROR',
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(details ? { details } : {}),
    };

    const context = `${request.method} ${request.url} -> ${status}`;
    if (status >= 500) {
      this.logger.error(context, exception instanceof Error ? exception.stack : String(exception));
    } else {
      this.logger.warn(`${context}: ${message}`);
    }

    // Recorded before the response goes out, and never awaited: a failure to
    // write the trail must not turn a 403 into a hung request.
    void this.audit?.record(request, status);

    response.status(status).json(body);
  }
}
