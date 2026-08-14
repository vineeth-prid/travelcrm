import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppInfo } from '@travel-crm/sdk';
import { z } from 'zod';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiZodResponse } from '../shared/zod';
import { SettingsService } from './settings.service';

const appInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  buildNumber: z.string(),
  environment: z.string(),
  apiVersion: z.string(),
  nodeVersion: z.string(),
  startedAt: z.string().datetime(),
  companyName: z.string(),
  companyLogoConfigured: z.boolean(),
});

/**
 * Build and runtime information. Behind the session on purpose: the version,
 * the environment and the Node build are free reconnaissance for anybody
 * deciding whether a known CVE applies here, and only signed-in staff have any
 * use for them. `/health` stays open, because Docker has to reach it.
 */
@ApiTags('settings')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('app-info')
  @ApiOperation({ summary: 'Application build and runtime information' })
  @ApiZodResponse(HttpStatus.OK, appInfoSchema, 'Application information')
  appInfo(): AppInfo {
    return this.settings.getAppInfo();
  }
}
