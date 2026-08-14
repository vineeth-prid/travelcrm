/**
 * End-to-end smoke test of the authentication surface. The real Nest
 * application is booted — same modules, guards, pipes and exception filter as
 * production — with only the database swapped for an in-memory stub.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';

// Must be set before AppModule is loaded: ConfigModule.forRoot() validates the
// environment while the module metadata is evaluated.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';

async function main(): Promise<void> {
  const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');

  const { app, prisma, base } = await bootApp();
  const http = app.getHttpServer() as Parameters<typeof request>[0];

  // --- public endpoints -----------------------------------------------------
  const health = await request(http).get(`${base}/health`).expect(200);
  assert.equal(health.body.status, 'ok');
  assert.deepEqual(health.body.services, { api: 'up', database: 'up' });

  // Version and environment are reconnaissance, so app-info sits behind the
  // session even though it holds no customer data. /health stays open for
  // Docker's health check.
  await request(http).get(`${base}/settings/app-info`).expect(401);

  // Every response carries them, including this unauthenticated one.
  assert.equal(health.headers['x-content-type-options'], 'nosniff');
  assert.equal(health.headers['content-security-policy'], "frame-ancestors 'none'");

  // --- protected route without a session ------------------------------------
  const unauthorized = await request(http).get(`${base}/me`).expect(401);
  assert.equal(unauthorized.body.statusCode, 401);
  assert.equal(unauthorized.body.path, `${base}/me`);
  assert.ok(unauthorized.body.timestamp);

  // --- login validation -----------------------------------------------------
  const invalid = await request(http)
    .post(`${base}/login`)
    .send({ email: 'not-an-email', password: '' })
    .expect(400);
  assert.equal(invalid.body.message, 'Validation failed');
  assert.ok(invalid.body.details.email?.length);
  assert.ok(invalid.body.details.password?.length);

  const wrongPassword = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: 'WrongPassword1' })
    .expect(401);
  assert.equal(wrongPassword.body.message, 'Invalid email or password');

  const unknownEmail = await request(http)
    .post(`${base}/login`)
    .send({ email: 'nobody@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(401);
  assert.equal(
    unknownEmail.body.message,
    wrongPassword.body.message,
    'unknown emails must not be distinguishable from wrong passwords',
  );

  // --- successful login -----------------------------------------------------
  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: ' ADMIN@travelcrm.test ', password: ADMIN_PASSWORD })
    .expect(200);

  assert.equal(login.body.user.email, 'admin@travelcrm.test');
  assert.equal(login.body.user.password, undefined, 'the password hash must never be returned');

  const sessionCookie = sessionCookieFrom(login.headers);
  assert.ok(sessionCookie, 'login must set the session cookie');
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);

  // --- authenticated requests ----------------------------------------------
  const me = await request(http).get(`${base}/me`).set('Cookie', sessionCookie).expect(200);
  assert.equal(me.body.id, prisma.users[0]?.id);

  const appInfo = await request(http)
    .get(`${base}/settings/app-info`)
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(appInfo.body.apiVersion, 'v1');
  assert.equal(appInfo.body.name, 'Travel CRM');

  const updated = await request(http)
    .patch(`${base}/me`)
    .set('Cookie', sessionCookie)
    .send({ name: 'Ada L.', email: 'admin@travelcrm.test' })
    .expect(200);
  assert.equal(updated.body.name, 'Ada L.');
  assert.equal(prisma.users[0]?.name, 'Ada L.');

  const badProfile = await request(http)
    .patch(`${base}/me`)
    .set('Cookie', sessionCookie)
    .send({ name: 'A', email: 'admin@travelcrm.test' })
    .expect(400);
  assert.ok(badProfile.body.details.name?.length);

  const wrongCurrent = await request(http)
    .post(`${base}/me/password`)
    .set('Cookie', sessionCookie)
    .send({ currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass1' })
    .expect(400);
  assert.ok(wrongCurrent.body.details.currentPassword?.length);

  await request(http)
    .post(`${base}/me/password`)
    .set('Cookie', sessionCookie)
    .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'BrandNewPass1' })
    .expect(200);
  assert.ok(
    bcrypt.compareSync('BrandNewPass1', prisma.users[0]?.password ?? ''),
    'the new password must be stored hashed',
  );

  // --- logout ---------------------------------------------------------------
  const logout = await request(http)
    .post(`${base}/logout`)
    .set('Cookie', sessionCookie)
    .expect(200);
  const cleared = sessionCookieFrom(logout.headers);
  assert.ok(cleared?.startsWith('travel_crm_session=;'), 'logout must clear the session cookie');

  // --- Swagger --------------------------------------------------------------
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Travel CRM API').setVersion('test').build(),
  );
  for (const path of [
    `${base}/login`,
    `${base}/logout`,
    `${base}/me`,
    `${base}/me/password`,
    `${base}/health`,
    `${base}/settings/app-info`,
    `${base}/conversations`,
    `${base}/conversations/{id}`,
    `${base}/conversations/{id}/messages`,
    `${base}/webhooks/instagram`,
    `${base}/webhooks/whatsapp`,
  ]) {
    assert.ok(document.paths[path], `Swagger is missing ${path}`);
  }
  assert.ok(
    document.paths[`${base}/login`]?.post?.requestBody,
    'the login request body must be documented',
  );

  await app.close();
  console.log('All API smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
