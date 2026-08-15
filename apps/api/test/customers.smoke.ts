/**
 * End-to-end smoke test of the customer book.
 *
 * The point of the view is the repeat customer, so that is what is asserted:
 * a second lead for the same person must show up as one customer with two
 * enquiries, not as two customers. The other half is visibility — the book is
 * scoped through the leads, so it cannot become a way around the lead scope.
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

const LEAD_BODY = {
  customerName: 'Priya Nair',
  phone: '+91 98765 43210',
  email: 'priya@example.com',
  city: 'Kochi',
  destination: 'Dubai',
  adults: '2',
  budget: '150000',
  currency: 'INR',
  source: 'MANUAL',
};

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');

  const { app, base } = await bootApp();
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

  // --- a customer appears with their first lead -----------------------------
  const first = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send(LEAD_BODY)
    .expect(201);

  const customerId = first.body.customer.id as string;

  const book = await request(http).get(`${base}/customers`).set('Cookie', admin).expect(200);
  const entry = (book.body as { id: string; leadCount: number; destinations: string[] }[]).find(
    (row) => row.id === customerId,
  );

  assert.ok(entry, 'the customer is in the book as soon as their lead exists');
  assert.equal(entry.leadCount, 1);
  assert.deepEqual(entry.destinations, ['Dubai']);

  // --- a second enquiry is the same customer, not a new one -----------------
  await request(http)
    .post(`${base}/leads`)
    .query({ allowDuplicate: true })
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, customerId, destination: 'Singapore' })
    .expect(201);

  const afterRepeat = await request(http).get(`${base}/customers`).set('Cookie', admin).expect(200);
  const repeat = (
    afterRepeat.body as { id: string; leadCount: number; destinations: string[] }[]
  ).find((row) => row.id === customerId);

  assert.ok(repeat);
  assert.equal(repeat.leadCount, 2, 'two enquiries, one customer');
  assert.deepEqual([...repeat.destinations].sort(), ['Dubai', 'Singapore']);

  const repeatOnly = await request(http)
    .get(`${base}/customers`)
    .query({ repeatOnly: true })
    .set('Cookie', admin)
    .expect(200);
  assert.ok(
    (repeatOnly.body as { id: string }[]).some((row) => row.id === customerId),
    'and they are what the repeat filter is for',
  );

  // --- search ----------------------------------------------------------------
  const searched = await request(http)
    .get(`${base}/customers`)
    .query({ search: 'priya' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok((searched.body as unknown[]).length >= 1, 'search is case-insensitive');

  const byPhone = await request(http)
    .get(`${base}/customers`)
    .query({ search: '9876543210' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok(
    (byPhone.body as { id: string }[]).some((row) => row.id === customerId),
    'a phone number typed without its formatting still finds them',
  );

  // --- detail ----------------------------------------------------------------
  const detail = await request(http)
    .get(`${base}/customers/${customerId}`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(detail.body.customer.id, customerId);
  assert.equal(detail.body.leads.length, 2);
  assert.deepEqual(detail.body.invoices, [], 'nothing billed yet');

  // --- the book cannot be read around the lead scope ------------------------
  const employeeBook = await request(http)
    .get(`${base}/customers`)
    .set('Cookie', employee)
    .expect(200);
  assert.ok(
    !(employeeBook.body as { id: string }[]).some((row) => row.id === customerId),
    "an employee does not see customers behind another consultant's leads",
  );

  await request(http).get(`${base}/customers/${customerId}`).set('Cookie', employee).expect(404);

  // --- and not at all without a session -------------------------------------
  await request(http).get(`${base}/customers`).expect(401);

  // --- searching by where they want to go -----------------------------------
  const byDestination = await request(http)
    .get(`${base}/customers`)
    .query({ search: 'singapore' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok(
    (byDestination.body as { id: string }[]).some((row) => row.id === customerId),
    '"who wanted Singapore?" is a question the book should answer',
  );

  // --- an enquiry becomes a customer when the first invoice is raised -------
  const beforeInvoice = await request(http).get(`${base}/leads`).set('Cookie', admin).expect(200);
  const pipelineBefore = (beforeInvoice.body.leads as { id: string }[]).length;

  await request(http)
    .post(`${base}/leads/${first.body.id}/invoices`)
    .set('Cookie', admin)
    .send({
      packageTitle: 'Dubai, 5 nights',
      billingName: 'Priya Nair',
      currency: 'INR',
      packageAmount: '150000',
      discountAmount: '0',
      issueDate: '2026-08-01',
      dueDate: '2026-08-15',
    })
    .expect(201);

  const afterInvoice = await request(http).get(`${base}/leads`).set('Cookie', admin).expect(200);
  assert.equal(
    (afterInvoice.body.leads as unknown[]).length,
    pipelineBefore - 2,
    'both of this customer’s leads leave the pipeline once they are a customer',
  );

  const withConverted = await request(http)
    .get(`${base}/leads`)
    .query({ includeConverted: true })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(
    (withConverted.body.leads as unknown[]).length,
    pipelineBefore,
    'and come back when asked for',
  );

  const booked = await request(http)
    .get(`${base}/customers/${customerId}`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(booked.body.invoices.length, 1, 'the invoice is on the customer now');
  assert.ok(
    (booked.body.leads as { stage: string }[]).some((lead) => lead.stage === 'WON'),
    'billing somebody marks the enquiry won rather than leaving it open',
  );

  await app.close();
  console.log('All customer smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
