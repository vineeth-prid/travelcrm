import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppInfo } from '@travel-crm/sdk';
import { z } from 'zod';

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

@ApiTags('settings')
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
