import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StorageService } from './storage.service';

/**
 * Serves a stored document through the API.
 *
 * Used when the object is on local disk because MinIO was unreachable, and
 * when MinIO holds it but a presigned link could not be produced — the
 * document exists either way, and a link that cannot be signed should not look
 * like a document that was never made.
 *
 * Behind the session, unlike a presigned link: there is no signature in the URL
 * to stand in for authentication, so the cookie has to do it. Which means these
 * links are for staff, not for forwarding to a customer.
 */
@ApiTags('files')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'files', version: '1' })
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get('*key')
  @ApiOperation({ summary: 'A locally stored document' })
  async get(@Param('key') key: string | string[], @Res() response: Response): Promise<void> {
    // Express hands a wildcard back as segments; the object key is the join.
    const objectKey = Array.isArray(key) ? key.join('/') : key;
    const body = await this.storage.read(objectKey);

    if (!body) {
      throw new NotFoundException('That document is no longer stored anywhere.');
    }

    const filename = objectKey.split('/').pop() ?? 'document.pdf';

    response.setHeader('Content-Type', 'application/pdf');
    // `inline` so it opens in the browser's viewer, which is what somebody
    // clicking "download" on a proposal actually wants to see first.
    response.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    response.send(body);
  }
}
