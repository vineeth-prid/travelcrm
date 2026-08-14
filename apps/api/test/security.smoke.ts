/**
 * The security sweep: staff administration, the audit trail, CSV exports, and
 * a table-driven walk over every administrator-only route.
 *
 * The sweep is the point. Each phase added endpoints and asserted its own
 * access rules, but nothing until now checked them *together* — and an
 * authorisation gap is exactly the kind of thing that survives because every
 * individual test passed.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';

/** Every route that must refuse an employee, with the verb that reaches it. */
const ADMIN_ONLY: [method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string][] = [
  ['get', '/reports/dashboard'],
  ['get', '/expenses'],
  ['get', '/expenses/summary'],
  ['get', '/expenses/categories'],
  ['post', '/expenses'],
  ['post', '/expenses/categories'],
  ['get', '/settings/smtp'],
  ['put', '/settings/smtp'],
  ['post', '/settings/smtp/test'],
  ['get', '/settings/notifications'],
  ['get', '/follow-ups/rules'],
  ['post', '/follow-ups/rules'],
  ['get', '/audit'],
  ['get', '/users'],
  ['post', '/users'],
  ['get', '/exports/leads.csv'],
  ['get', '/exports/proposals.csv'],
  ['get', '/exports/payments.csv'],
  ['get', '/exports/expenses.csv'],
];

/** Routes any signed-in user may reach, but nobody anonymous. */
const AUTHENTICATED: [method: 'get' | 'post', path: string][] = [
  ['get', '/me'],
  ['get', '/staff'],
  ['get', '/leads'],
  ['get', '/follow-ups'],
  ['get', '/invoices'],
  ['get', '/payments'],
  ['get', '/proposals'],
  ['get', '/customers'],
  ['get', '/reports/performance'],
  ['get', '/ai/status'],
  ['get', '/settings/app-info'],
];

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(StorageService).useValue({
      put: () => Promise.resolve(),
      presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}`),
    }),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  const signIn = async (email: string, password: string): Promise<string> => {
    const response = await request(http)
      .post(`${base}/login`)
      .send({ email, password })
      .expect(200);
    const cookie = sessionCookieFrom(response.headers);
    assert.ok(cookie);
    return cookie;
  };

  const admin = await signIn('admin@travelcrm.test', ADMIN_PASSWORD);
  const employee = await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  const adminId = prisma.users[0]!.id;
  const employeeId = prisma.users[1]!.id;

  // --- the sweep -----------------------------------------------------------
  for (const [method, path] of ADMIN_ONLY) {
    const anonymous = await request(http)[method](`${base}${path}`).send({});
    assert.equal(anonymous.status, 401, `${method.toUpperCase()} ${path} must require a session`);

    const asEmployee = await request(http)
      [method](`${base}${path}`)
      .set('Cookie', employee)
      .send({});
    assert.equal(
      asEmployee.status,
      403,
      `${method.toUpperCase()} ${path} must refuse an employee (got ${asEmployee.status})`,
    );
  }

  for (const [method, path] of AUTHENTICATED) {
    const anonymous = await request(http)[method](`${base}${path}`).send({});
    assert.equal(anonymous.status, 401, `${method.toUpperCase()} ${path} must require a session`);

    const asEmployee = await request(http)[method](`${base}${path}`).set('Cookie', employee);
    assert.ok(
      asEmployee.status < 400,
      `${method.toUpperCase()} ${path} should be open to an employee (got ${asEmployee.status})`,
    );
  }

  // --- staff administration -------------------------------------------------
  const users = await request(http).get(`${base}/users`).set('Cookie', admin).expect(200);
  assert.equal(users.body.length, 2);
  assert.ok(
    !JSON.stringify(users.body).includes('$2'),
    'no bcrypt hash is ever serialised into a response',
  );

  const weakPassword = await request(http)
    .post(`${base}/users`)
    .set('Cookie', admin)
    .send({
      name: 'Meera Iyer',
      email: 'meera@travelcrm.test',
      password: 'short',
      role: 'EMPLOYEE',
    })
    .expect(400);
  assert.ok(weakPassword.body.details.password?.length);

  const duplicateEmail = await request(http)
    .post(`${base}/users`)
    .set('Cookie', admin)
    .send({
      name: 'Someone',
      email: EMPLOYEE_EMAIL,
      password: 'ValidPassword1',
      role: 'EMPLOYEE',
    })
    .expect(400);
  assert.ok(duplicateEmail.body.details.email?.length);

  const created = await request(http)
    .post(`${base}/users`)
    .set('Cookie', admin)
    .send({
      name: 'Meera Iyer',
      email: 'Meera@TravelCRM.test',
      password: 'ValidPassword1',
      role: 'EMPLOYEE',
    })
    .expect(201);

  assert.equal(created.body.email, 'meera@travelcrm.test', 'emails are normalised');
  assert.equal(created.body.role, 'EMPLOYEE');
  assert.equal(created.body.active, true);
  assert.equal(created.body.canViewOwnProfitability, false, 'margin access is off by default');
  assert.ok(!('password' in created.body));

  // The new account can actually sign in — the whole point of creating it.
  const meera = await signIn('meera@travelcrm.test', 'ValidPassword1');
  await request(http).get(`${base}/me`).set('Cookie', meera).expect(200);

  // Deactivating takes effect on the next request, not at token expiry.
  await request(http)
    .patch(`${base}/users/${created.body.id}`)
    .set('Cookie', admin)
    .send({
      name: 'Meera Iyer',
      email: 'meera@travelcrm.test',
      role: 'EMPLOYEE',
      active: false,
      canViewOwnProfitability: false,
    })
    .expect(200);

  // The session is re-validated against the database on every request, so a
  // deactivated account loses access immediately rather than at token expiry.
  await request(http).get(`${base}/me`).set('Cookie', meera).expect(401);

  // An admin cannot lock themselves out.
  const selfDemote = await request(http)
    .patch(`${base}/users/${adminId}`)
    .set('Cookie', admin)
    .send({
      name: 'Ada Lovelace',
      email: 'admin@travelcrm.test',
      role: 'EMPLOYEE',
      active: true,
      canViewOwnProfitability: true,
    })
    .expect(400);
  assert.match(selfDemote.body.message, /cannot remove your own administrator access/i);

  // Granting margin access is what turns the permission on.
  await request(http)
    .patch(`${base}/users/${employeeId}`)
    .set('Cookie', admin)
    .send({
      name: 'Rahul Sharma',
      email: EMPLOYEE_EMAIL,
      role: 'EMPLOYEE',
      active: true,
      canViewOwnProfitability: true,
    })
    .expect(200);
  assert.equal(prisma.users[1]!.canViewOwnProfitability, true);

  // A reset lets them in with the new password.
  await request(http)
    .post(`${base}/users/${employeeId}/password`)
    .set('Cookie', admin)
    .send({ password: 'BrandNewPass9' })
    .expect(200);

  const rahul = await signIn(EMPLOYEE_EMAIL, 'BrandNewPass9');

  // An employee cannot reset anybody's password, including their own — that
  // is `/me/password`, which demands the current one.
  await request(http)
    .post(`${base}/users/${employeeId}/password`)
    .set('Cookie', rahul)
    .send({ password: 'AnotherPass1' })
    .expect(403);

  // --- brute force ----------------------------------------------------------
  // Sign-in is throttled far harder than everything else. Rather than counting
  // exactly how many attempts have already happened — brittle, and it would
  // break the next time a test above adds a login — this hammers it and
  // asserts the door shuts.
  let refusals = 0;
  let attempts = 0;

  while (attempts < 12 && refusals === 0) {
    attempts += 1;
    const response = await request(http)
      .post(`${base}/login`)
      .send({ email: EMPLOYEE_EMAIL, password: 'WrongPassword1' });

    if (response.status === 429) refusals += 1;
    else assert.equal(response.status, 401, 'a wrong password is refused');
  }

  assert.equal(
    refusals,
    1,
    `sign-in is rate limited against brute force (gave up after ${attempts})`,
  );

  // --- the audit trail ------------------------------------------------------
  const audit = await request(http).get(`${base}/audit`).set('Cookie', admin).expect(200);

  const summaries = (audit.body as { summary: string; actorName: string; status: number }[]).map(
    (entry) => entry.summary,
  );

  assert.ok(
    summaries.some((summary) => summary.includes('Created a user account')),
    'creating an account is on the record',
  );
  assert.ok(summaries.some((summary) => summary.includes('Signed in')));
  assert.ok(
    summaries.some((summary) => summary.includes('Reset the password')),
    'so is a password reset',
  );

  // Refused attempts are recorded too — the interesting half of a security log.
  const refused = (audit.body as { summary: string; status: number }[]).filter(
    (entry) => entry.status >= 400,
  );
  assert.ok(refused.length > 0, 'refused attempts are on the record');
  assert.ok(refused.every((entry) => entry.summary.endsWith('— refused')));

  // A failed sign-in is recorded, and names the account that was attempted —
  // there is no signed-in user to attribute it to, which is exactly when
  // knowing the target matters.
  const failedLogin = (audit.body as { summary: string; actorName: string; status: number }[]).find(
    (entry) => entry.summary.includes('Signed in') && entry.status === 401,
  );
  assert.ok(failedLogin, 'a failed sign-in is recorded');
  assert.match(failedLogin.actorName, /@/, 'and names the account that was attempted');
  assert.notEqual(failedLogin.actorName, 'anonymous');

  // The throttled attempts are on the record too, which is what turns this
  // table into something worth reading after a break-in attempt.
  assert.ok(
    (audit.body as { status: number }[]).some((entry) => entry.status === 429),
    'rate-limited attempts are recorded',
  );

  assert.ok(
    !JSON.stringify(audit.body).includes('ValidPassword1'),
    'no password reaches the audit trail',
  );
  assert.ok(!JSON.stringify(audit.body).includes('BrandNewPass9'));

  // Newest first, and reads are not recorded.
  const seqOrder = (audit.body as { createdAt: string }[]).map((entry) => entry.createdAt);
  assert.deepEqual(seqOrder, [...seqOrder].sort().reverse(), 'newest first');
  assert.ok(
    !summaries.some((summary) => summary.toLowerCase().includes('listed')),
    'reads are not audited — they would swamp the table',
  );

  const filtered = await request(http)
    .get(`${base}/audit`)
    .query({ entity: 'user' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok((filtered.body as unknown[]).length > 0);
  assert.ok((filtered.body as { entity: string }[]).every((entry) => entry.entity === 'user'));

  // There is no way to write to it.
  await request(http).post(`${base}/audit`).set('Cookie', admin).send({}).expect(404);
  await request(http).delete(`${base}/audit`).set('Cookie', admin).expect(404);

  // --- CSV export -----------------------------------------------------------
  const { toCsv } = await import('../src/exports/csv');

  // Formula injection: a customer called `=HYPERLINK(...)` must not become a
  // live formula in whoever's spreadsheet opens the file.
  const dangerous = toCsv(
    ['Name', 'Note'],
    [
      ['=HYPERLINK("http://evil","click")', 'Dubai, UAE'],
      ['+1234', 'line one\nline two'],
    ],
  );

  assert.ok(dangerous.includes(`'=HYPERLINK`), 'a leading = is neutered');
  assert.ok(dangerous.includes(`'+1234`), 'so is a leading +');
  assert.ok(dangerous.includes('"Dubai, UAE"'), 'a comma is quoted');
  assert.ok(dangerous.includes('"line one\nline two"'), 'so is a newline');
  assert.ok(dangerous.startsWith('﻿'), 'a BOM keeps Excel from mangling accents');

  const leadsCsv = await request(http)
    .get(`${base}/exports/leads.csv`)
    .set('Cookie', admin)
    .expect(200);

  assert.match(leadsCsv.headers['content-type'], /text\/csv/);
  assert.match(
    leadsCsv.headers['content-disposition'],
    /attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"/,
  );
  assert.match(leadsCsv.text, /Reference,Customer,Phone/);

  const proposalsCsv = await request(http)
    .get(`${base}/exports/proposals.csv`)
    .set('Cookie', admin)
    .expect(200);
  assert.match(
    proposalsCsv.text,
    /Selling price,Actual cost,Gross profit,Margin %/,
    'the proposal export is an internal document and says so by carrying cost',
  );

  // --- password hashes never leave the building -----------------------------
  //
  // Every list embeds the colleague who created or was assigned the row. Those
  // relations are selected column by column so the bcrypt hash is not even
  // fetched; this is the check that fails if somebody widens one back to
  // `include: { createdBy: true }` and then spreads the record.
  const hash = prisma.users[0]!.password;
  assert.ok(hash.startsWith('$2'), 'the fixture must really hold a bcrypt hash');

  for (const path of [
    '/users',
    '/leads',
    '/invoices',
    '/payments',
    '/proposals',
    '/customers',
    '/expenses',
    '/follow-ups',
    '/staff',
  ]) {
    const response = await request(http).get(`${base}${path}`).set('Cookie', admin).expect(200);
    const body = JSON.stringify(response.body);

    assert.ok(!body.includes(hash), `${path} leaked a password hash`);
    assert.ok(!/"password"\s*:/.test(body), `${path} returned a password field`);
  }

  await app.close();
  console.log('All security smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
