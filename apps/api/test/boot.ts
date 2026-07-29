/**
 * Boots the real Nest application for the smoke tests, wired exactly like
 * main.ts but with the database (and optionally the providers) stubbed.
 */
import { VersioningType, type INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import cookieParser from 'cookie-parser';

import { createPrismaStub, type PrismaStub } from './prisma-stub';

export interface BootedApp {
  app: INestApplication;
  prisma: PrismaStub;
  /** Base path every request goes through, matching production. */
  base: string;
}

export async function bootApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<BootedApp> {
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/shared/prisma.service');
  const { AllExceptionsFilter } = await import('../src/shared/all-exceptions.filter');

  const prisma = createPrismaStub();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma);

  if (configure) {
    builder = configure(builder);
  }

  const moduleRef = await builder.compile();

  // rawBody mirrors main.ts and is what webhook signature checking reads.
  const app = moduleRef.createNestApplication({ logger: false, rawBody: true });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  return { app, prisma, base: '/api/v1' };
}

export function sessionCookieFrom(headers: Record<string, unknown>): string | undefined {
  const cookies = headers['set-cookie'];
  const list = Array.isArray(cookies) ? (cookies as string[]) : [];
  return list.find((value) => value.startsWith('travel_crm_session='));
}
