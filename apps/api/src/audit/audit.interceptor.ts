import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';

import { AuditRecorder } from './audit.recorder';

/**
 * Records the requests that succeeded.
 *
 * Failures are recorded by the exception filter instead — an interceptor never
 * runs for a request a guard rejected, so 401, 403 and 429 would otherwise be
 * missing from the trail. Between the two, each audited request is written
 * exactly once.
 *
 * Reads are not recorded, with the deliberate exception of the CSV exports:
 * they would swamp the table and tell nobody anything, but somebody taking the
 * customer list out of the building is worth a line.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly recorder: AuditRecorder) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    if (!this.recorder.ruleFor(request.method, request.url)) return next.handle();

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(tap(() => void this.recorder.record(request, response.statusCode)));
  }
}
