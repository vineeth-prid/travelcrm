import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppInfo } from '@travel-crm/sdk';

import type { Env } from '../config/env';

export const API_VERSION = 'v1';

@Injectable()
export class SettingsService {
  private readonly startedAt = new Date().toISOString();

  constructor(private readonly config: ConfigService<Env, true>) {}

  getAppInfo(): AppInfo {
    return {
      name: 'Travel CRM',
      version: this.config.get('APP_VERSION', { infer: true }),
      buildNumber: this.config.get('BUILD_NUMBER', { infer: true }),
      environment: this.config.get('NODE_ENV', { infer: true }),
      apiVersion: API_VERSION,
      nodeVersion: process.version,
      startedAt: this.startedAt,
      companyName: this.config.get('COMPANY_NAME', { infer: true }),
      companyLogoConfigured: this.config.get('COMPANY_LOGO_PATH', { infer: true }).length > 0,
    };
  }
}
