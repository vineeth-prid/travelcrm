import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AiModule } from './ai/ai.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditModule } from './audit/audit.module';
import { AuditRecorder } from './audit/audit.recorder';
import { AuthModule } from './auth/auth.module';
import { CommunicationModule } from './communication/communication.module';
import { validateEnv, type Env } from './config/env';
import { CustomersModule } from './customers/customers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { InvoicesModule } from './invoices/invoices.module';
import { LeadsModule } from './leads/leads.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProposalsModule } from './proposals/proposals.module';
import { QuotesModule } from './quotes/quotes.module';
import { ReportsModule } from './reports/reports.module';
import { StorageModule } from './storage/storage.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SettingsModule } from './settings/settings.module';
import { AllExceptionsFilter } from './shared/all-exceptions.filter';
import { LoggingInterceptor } from './shared/logging.interceptor';
import { SecurityHeadersMiddleware } from './shared/security-headers.middleware';
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
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          name: 'default',
          ttl: 60_000,
          limit: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
        },
      ],
    }),
    // Drives the weekly Instagram access token refresh.
    ScheduleModule.forRoot(),
    SharedModule,
    AuthModule,
    UsersModule,
    SettingsModule,
    HealthModule,
    IntegrationsModule,
    CommunicationModule,
    LeadsModule,
    CustomersModule,
    NotificationsModule,
    FollowUpsModule,
    ProposalsModule,
    InvoicesModule,
    ExpensesModule,
    ReportsModule,
    AuditModule,
    WebhooksModule,
    AiModule,
    StorageModule,
    QuotesModule,
  ],
  providers: [
    AuditRecorder,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    // Global rather than per-service because coverage is what makes an audit
    // trail worth having, and a hand-written call is a thing somebody forgets.
    // The interceptor records successes; the filter records refusals, which it
    // has to because a guard rejection never reaches an interceptor.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
