import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { CommunicationModule } from './communication/communication.module';
import { validateEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { QuotesModule } from './quotes/quotes.module';
import { StorageModule } from './storage/storage.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SettingsModule } from './settings/settings.module';
import { LoggingInterceptor } from './shared/logging.interceptor';
import { SharedModule } from './shared/shared.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Run from apps/api, but the single source of truth is the repo-root .env.
      envFilePath: ['.env', '../../.env.local', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // Drives the weekly Instagram access token refresh.
    ScheduleModule.forRoot(),
    SharedModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    HealthModule,
    IntegrationsModule,
    CommunicationModule,
    WebhooksModule,
    AiModule,
    StorageModule,
    QuotesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
