import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * The headers every API response carries.
 *
 * The API serves PDFs and CSVs as well as JSON, and both are built partly from
 * text a customer typed. `nosniff` is what stops a browser deciding one of them
 * is HTML and running it. `frame-ancestors` matters less here than on the web
 * app — there is nothing to click in a JSON response — but Swagger is served
 * from this origin too.
 *
 * Registered as middleware rather than in main.ts so the smoke tests, which
 * boot the same module, exercise the real headers.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
    next();
  }
}
