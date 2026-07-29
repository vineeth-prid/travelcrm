import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import type { Env } from './config/env';
import { AllExceptionsFilter } from './shared/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody is required to verify Meta's X-Hub-Signature-256 on webhooks.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger([config.get('LOG_LEVEL', { infer: true })]);
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Travel CRM API')
      .setDescription('Phase 1 — authentication, current user, settings and health.')
      .setVersion(config.get('APP_VERSION', { infer: true }))
      .addCookieAuth('travel_crm_session')
      .build(),
  );
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  logger.log(`Swagger UI on http://localhost:${port}/docs`);
}

void bootstrap();
