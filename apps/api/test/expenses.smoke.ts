/**
 * End-to-end smoke test of the expense manager.
 *
 * Two things matter most here. First, §12: expenses are company-wide financial
 * data and an employee must not reach them at all — not a filtered view, not
 * an empty list, a refusal. Second, that the dashboard's arithmetic is right,
 * because it is what an administrator will make decisions from.
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

const stored = new Map<string, { body: Buffer; contentType: string }>();

function createStorageFake() {
  return {
    put: (key: string, body: Buffer, contentType: string) => {
      stored.set(key, { body, contentType });
      return Promise.resolve();
    },
    presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}?sig=abc`),
  };
}

/**
 * A date in a past month, so "this month" and "last month" are real.
 *
 * Day 1 deliberately: the default reporting window ends *today*, so a fixture
 * dated later in the current month would fall outside it and the totals would
 * be short — which is correct behaviour and a misleading test.
 */
function monthsAgo(months: number, day = 1): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, day));
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(StorageService).useValue(createStorageFake()),
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

  // --- §12: expenses are not an employee's business ------------------------
  // Every route, not just the list — a single unguarded one would be enough.
  for (const [method, path] of [
    ['get', '/expenses'],
    ['get', '/expenses/summary'],
    ['get', '/expenses/categories'],
  ] as const) {
    await request(http)[method](`${base}${path}`).set('Cookie', employee).expect(403);
  }

  await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', employee)
    .send({ spentAt: '2026-08-01', description: 'x', amount: 1, currency: 'INR', method: 'CASH' })
    .expect(403);

  await request(http).get(`${base}/expenses`).expect(401);

  // --- categories ------------------------------------------------------------
  const categories = await request(http)
    .get(`${base}/expenses/categories`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(categories.body.length, 10, 'the ten categories from the brief are seeded');
  assert.deepEqual(
    categories.body.slice(0, 3).map((category: { name: string }) => category.name),
    ['Advertising', 'Marketing', 'Office'],
    'and come back in a deliberate order',
  );

  const advertising = categories.body[0] as { id: string; slug: string };
  const software = (categories.body as { id: string; name: string }[]).find(
    (category) => category.name === 'Software',
  )!;
  assert.equal(advertising.slug, 'advertising');

  const duplicate = await request(http)
    .post(`${base}/expenses/categories`)
    .set('Cookie', admin)
    .send({ name: 'Advertising' })
    .expect(400);
  assert.ok(duplicate.body.details.name?.length, 'two categories cannot share a name');

  const added = await request(http)
    .post(`${base}/expenses/categories`)
    .set('Cookie', admin)
    .send({ name: 'Visa & permits' })
    .expect(201);
  assert.equal(added.body.slug, 'visa-permits');

  // Renaming keeps the slug, so a year of reporting is not orphaned.
  const renamed = await request(http)
    .patch(`${base}/expenses/categories/${advertising.id}`)
    .set('Cookie', admin)
    .send({ name: 'Advertising & PR' })
    .expect(200);
  assert.equal(renamed.body.name, 'Advertising & PR');
  assert.equal(renamed.body.slug, 'advertising', 'the slug is stable across a rename');

  // --- validation ------------------------------------------------------------
  const base_ = {
    spentAt: monthsAgo(0),
    categoryId: software.id,
    description: 'Prisma Cloud subscription',
    amount: '4500',
    currency: 'INR',
    method: 'CARD',
    vendor: 'Prisma',
  };

  const noDescription = await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, description: '' })
    .expect(400);
  assert.ok(noDescription.body.details.description?.length);

  const zero = await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, amount: '0' })
    .expect(400);
  assert.ok(zero.body.details.amount?.length);

  const unknownCategory = await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, categoryId: '11111111-2222-4333-8444-555555555555' })
    .expect(400);
  assert.ok(unknownCategory.body.details.categoryId?.length);

  // --- recording -------------------------------------------------------------
  const created = await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, paidById: adminId, externalReference: 'INV-9981' })
    .expect(201);

  assert.match(created.body.reference, /^TDH-EXP-\d{5}$/);
  assert.equal(created.body.amount, 4500);
  assert.equal(created.body.category.name, 'Software');
  assert.equal(created.body.paidBy.id, adminId);
  assert.equal(created.body.createdBy.id, adminId);
  assert.equal(created.body.hasReceipt, false);

  // An expense the company account paid has no person against it.
  const companyPaid = await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, description: 'Office rent', categoryId: software.id, amount: '35000' })
    .expect(201);
  assert.equal(companyPaid.body.paidBy, null);

  // The update replaces the whole body, as everywhere else in this API — a
  // field left out of the request is cleared, not preserved.
  const updated = await request(http)
    .patch(`${base}/expenses/${created.body.id}`)
    .set('Cookie', admin)
    .send({
      ...base_,
      amount: '5000',
      description: 'Prisma Cloud — annual',
      externalReference: 'INV-9981',
    })
    .expect(200);
  assert.equal(updated.body.amount, 5000);
  assert.equal(updated.body.reference, created.body.reference, 'the reference is stable');
  assert.equal(updated.body.externalReference, 'INV-9981');

  const cleared = await request(http)
    .patch(`${base}/expenses/${created.body.id}`)
    .set('Cookie', admin)
    .send({ ...base_, amount: '5000', description: 'Prisma Cloud — annual' })
    .expect(200);
  assert.equal(cleared.body.externalReference, null, 'an omitted field is cleared');

  // Put it back for the search assertions below.
  await request(http)
    .patch(`${base}/expenses/${created.body.id}`)
    .set('Cookie', admin)
    .send({
      ...base_,
      amount: '5000',
      description: 'Prisma Cloud — annual',
      externalReference: 'INV-9981',
    })
    .expect(200);

  // --- receipts --------------------------------------------------------------
  const notAReceipt = await request(http)
    .post(`${base}/expenses/${created.body.id}/receipt`)
    .set('Cookie', admin)
    .attach('file', Buffer.from('MZ\x90\x00'), {
      filename: 'invoice.exe',
      contentType: 'application/x-msdownload',
    })
    .expect(400);
  assert.match(notAReceipt.body.message, /PDF or an image/i);
  assert.equal(stored.size, 0, 'and nothing was stored');

  const withReceipt = await request(http)
    .post(`${base}/expenses/${created.body.id}/receipt`)
    .set('Cookie', admin)
    .attach('file', Buffer.from('%PDF-1.4 fake receipt'), {
      filename: 'prisma-invoice.pdf',
      contentType: 'application/pdf',
    })
    .expect(200);

  assert.equal(withReceipt.body.hasReceipt, true);
  assert.equal(withReceipt.body.receiptName, 'prisma-invoice.pdf');
  assert.ok(
    !JSON.stringify(withReceipt.body).includes('expenses/'),
    'the storage key is never exposed — it would be a way around the download check',
  );

  const key = `expenses/${created.body.id}/receipt.pdf`;
  assert.ok(stored.has(key), 'stored under a derived key, not the uploaded filename');
  assert.equal(stored.get(key)!.contentType, 'application/pdf');

  const link = await request(http)
    .get(`${base}/expenses/${created.body.id}/receipt`)
    .set('Cookie', admin)
    .expect(200);
  assert.match(link.body.url, /^https:\/\/files\.test\//);
  assert.equal(link.body.name, 'prisma-invoice.pdf');

  // The download is authorised here, not at the object store.
  await request(http)
    .get(`${base}/expenses/${created.body.id}/receipt`)
    .set('Cookie', employee)
    .expect(403);

  await request(http)
    .get(`${base}/expenses/${companyPaid.body.id}/receipt`)
    .set('Cookie', admin)
    .expect(404);

  // --- the dashboard ---------------------------------------------------------
  // A spread of spending across three months and two categories.
  const spend = [
    { months: 0, amount: '12000', categoryId: advertising.id, description: 'Instagram ads' },
    { months: 1, amount: '8000', categoryId: advertising.id, description: 'Google ads' },
    { months: 2, amount: '20000', categoryId: software.id, description: 'Annual licences' },
  ];

  for (const item of spend) {
    await request(http)
      .post(`${base}/expenses`)
      .set('Cookie', admin)
      .send({
        ...base_,
        spentAt: monthsAgo(item.months),
        amount: item.amount,
        categoryId: item.categoryId,
        description: item.description,
      })
      .expect(201);
  }

  const summary = await request(http)
    .get(`${base}/expenses/summary`)
    .set('Cookie', admin)
    .expect(200);

  // 5,000 + 35,000 + 12,000 + 8,000 + 20,000
  assert.equal(summary.body.total, 80_000);
  assert.equal(summary.body.count, 5);
  assert.equal(summary.body.currency, 'INR');

  const advertisingTotal = (summary.body.byCategory as { name: string; total: number }[]).find(
    (row) => row.name === 'Advertising & PR',
  );
  assert.ok(advertisingTotal);
  assert.equal(advertisingTotal.total, 20_000, '12,000 + 8,000');

  // Highest first — that is what "highest expense categories" means.
  const ordered = (summary.body.byCategory as { total: number }[]).map((row) => row.total);
  assert.deepEqual(
    ordered,
    [...ordered].sort((a, b) => b - a),
    'sorted by spend, descending',
  );

  const shares = (summary.body.byCategory as { share: number }[]).map((row) => row.share);
  assert.equal(
    Math.round(shares.reduce((sum, share) => sum + share, 0)),
    100,
    'the shares account for the whole period',
  );

  // This month: 5,000 (the edited software one) + 12,000 + 35,000.
  assert.equal(summary.body.currentMonthTotal, 52_000);
  assert.equal(summary.body.previousMonthTotal, 8_000);

  assert.ok(summary.body.byMonth.length >= 3, 'the trend has a point per month with spending');
  assert.deepEqual(
    summary.body.byMonth.map((point: { month: string }) => point.month),
    [...summary.body.byMonth.map((point: { month: string }) => point.month)].sort(),
    'the trend runs forwards in time',
  );

  // --- currencies are not silently added together ---------------------------
  await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({ ...base_, currency: 'USD', amount: '99', description: 'Domain renewal' })
    .expect(201);

  const stillRupees = await request(http)
    .get(`${base}/expenses/summary`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(stillRupees.body.currency, 'INR', 'the dominant currency is reported');
  assert.equal(stillRupees.body.total, 80_000, 'and dollars are not added to rupees');
  assert.deepEqual(stillRupees.body.otherCurrencies, ['USD'], 'but they are named, not hidden');

  const inDollars = await request(http)
    .get(`${base}/expenses/summary`)
    .query({ currency: 'USD' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(inDollars.body.total, 99);
  assert.deepEqual(inDollars.body.otherCurrencies, ['INR']);

  // --- filtering -------------------------------------------------------------
  const byCategory = await request(http)
    .get(`${base}/expenses`)
    .query({ categoryId: advertising.id })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byCategory.body.length, 2);

  const bySearch = await request(http)
    .get(`${base}/expenses`)
    .query({ search: 'instagram' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(bySearch.body.length, 1, 'search is case-insensitive');

  const byVendor = await request(http)
    .get(`${base}/expenses`)
    .query({ search: 'INV-9981' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byVendor.body.length, 1, 'the vendor reference is searchable');

  const lastMonthOnly = await request(http)
    .get(`${base}/expenses`)
    .query({ from: monthsAgo(1, 1), to: monthsAgo(1, 28) })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(lastMonthOnly.body.length, 1);
  assert.equal(lastMonthOnly.body[0].description, 'Google ads');

  const newestFirst = (await request(http).get(`${base}/expenses`).set('Cookie', admin)).body as {
    spentAt: string;
  }[];
  assert.deepEqual(
    newestFirst.map((row) => row.spentAt),
    [...newestFirst.map((row) => row.spentAt)].sort().reverse(),
    'newest first',
  );

  // --- deleting --------------------------------------------------------------
  const before = prisma.expenses.length;
  await request(http)
    .delete(`${base}/expenses/${companyPaid.body.id}`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(prisma.expenses.length, before - 1);

  await request(http)
    .delete(`${base}/expenses/${companyPaid.body.id}`)
    .set('Cookie', admin)
    .expect(404);

  await request(http)
    .delete(`${base}/expenses/${created.body.id}`)
    .set('Cookie', employee)
    .expect(403);

  await app.close();
  console.log('All expense smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
