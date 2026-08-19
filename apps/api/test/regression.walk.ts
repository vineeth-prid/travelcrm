/**
 * A walk through the whole workflow against the real application.
 *
 * The per-area suites prove their own rules; this one proves the rules still
 * hold *together* — a lead with children becomes a proposal that carries them,
 * an email the customer receives, an invoice raised once from that proposal,
 * a customer who has left the pipeline, and a chase that appears in the list
 * without a refresh.
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

function step(name: string): void {
  console.log(`  - ${name}`);
}

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(StorageService).useValue({
      put: () => Promise.resolve(),
      presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}`),
      read: () => Promise.resolve(Buffer.from('%PDF-1.4')),
      hasLocal: () => false,
    }),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  const login = await request(http)
    .post(`${base}/login`)
    .send({ email: 'admin@travelcrm.test', password: ADMIN_PASSWORD })
    .expect(200);
  const admin = sessionCookieFrom(login.headers);
  assert.ok(admin);

  // --- what the documents are built from ------------------------------------
  await request(http)
    .put(`${base}/settings/company`)
    .set('Cookie', admin)
    .send({ name: 'Tour De India Holidays', taxId: '32ABCDE1234F1Z5', phone: '+91 98765 43210' })
    .expect(200);

  await request(http)
    .put(`${base}/settings/templates/invoice`)
    .set('Cookie', admin)
    .send({ validityDays: 21, taxRateBps: 500, paymentTerms: '50% on booking' })
    .expect(200);

  const template = await request(http)
    .get(`${base}/settings/templates/invoice`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(template.body.taxRateBps, 500, 'a new invoice starts at 5% GST');
  step('company details and the invoice template are settings, and they stick');

  // --- a lead, with children ------------------------------------------------
  const lead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({
      customerName: 'Regression Family',
      phone: '9876543210',
      email: 'family@example.com',
      destination: 'Bali',
      adults: '2',
      children: '2',
      childAges: [3, 15],
    })
    .expect(201);
  assert.deepEqual(lead.body.childAges, [3, 15]);
  step('a lead records the child ages');

  const badPhone = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ customerName: 'Too Short', phone: '987654321' })
    .expect(400);
  assert.ok(badPhone.body.details.phone?.length);
  step('a nine-digit phone number is refused');

  // --- the proposal carries them forward ------------------------------------
  const proposal = await request(http)
    .post(`${base}/leads/${lead.body.id}/proposals`)
    .set('Cookie', admin)
    .send({
      title: 'Bali for four',
      validUntil: '2027-06-30',
      currency: 'INR',
      adults: '2',
      children: '2',
      childAges: [3, 15],
      sellingPrice: '200000',
      actualCost: '150000',
    })
    .expect(201);
  assert.deepEqual(proposal.body.currentVersion.childAges, [3, 15]);
  step('the proposal carries the child ages forward');

  await request(http)
    .post(`${base}/proposals/${proposal.body.id}/generate`)
    .set('Cookie', admin)
    .expect(200);
  await request(http)
    .post(`${base}/proposals/${proposal.body.id}/submit`)
    .set('Cookie', admin)
    .expect(200);

  const emailed = prisma.notifications.filter((row) => row.type === 'PROPOSAL_SENT');
  assert.equal(emailed.length, 1, 'submitting emails the proposal to the customer');
  assert.equal(emailed[0]!.recipientEmail, 'family@example.com');
  assert.ok(emailed[0]!.body.includes('3, 15'), 'the email says who is travelling');
  assert.ok(!emailed[0]!.body.includes('150000'), 'and never what it cost us');
  step('submitting emails the proposal to the customer');

  // --- the follow-up gate ----------------------------------------------------
  const blocked = await request(http)
    .post(`${base}/follow-ups`)
    .set('Cookie', admin)
    .send({ proposalId: proposal.body.id, dueAt: '2027-01-01', reason: 'Too early' })
    .expect(400);
  assert.match(blocked.body.message, /scheduled/i);

  const flags = await request(http)
    .get(`${base}/proposals/${proposal.body.id}`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(
    flags.body.proposal.canAddFollowUp,
    false,
    'and the interface is told, not left to guess',
  );
  assert.equal(flags.body.proposal.isInvoiced, false);
  step('no follow-up may be added while the schedule is still running');

  // --- the invoice, from that proposal --------------------------------------
  const invoice = await request(http)
    .post(`${base}/leads/${lead.body.id}/invoices`)
    .set('Cookie', admin)
    .send({
      proposalId: proposal.body.id,
      issueDate: '2026-09-01',
      dueDate: '2026-09-22',
      packageTitle: 'Bali for four',
      currency: 'INR',
      packageAmount: '200000',
      discountAmount: '0',
      taxRateBps: '500',
      billingName: 'Regression Family',
    })
    .expect(201);

  assert.equal(invoice.body.totals.taxAmount, 10_000, '5% of 200,000');
  assert.equal(invoice.body.totals.totalAmount, 210_000);
  step('an invoice is raised from its proposal, with GST applied');

  const twice = await request(http)
    .post(`${base}/leads/${lead.body.id}/invoices`)
    .set('Cookie', admin)
    .send({
      proposalId: proposal.body.id,
      issueDate: '2026-09-01',
      dueDate: '2026-09-22',
      packageTitle: 'Bali again',
      currency: 'INR',
      packageAmount: '200000',
      discountAmount: '0',
      billingName: 'Regression Family',
    })
    .expect(400);
  assert.match(twice.body.message, /already been invoiced/i);
  step('and the same proposal cannot be billed twice');

  // --- the customer, now converted ------------------------------------------
  const book = await request(http).get(`${base}/customers`).set('Cookie', admin).expect(200);
  const customer = (book.body as { name: string; invoicedAmount: number }[]).find(
    (row) => row.name === 'Regression Family',
  );
  assert.ok(customer);
  assert.equal(customer.invoicedAmount, 210_000);

  const pipeline = await request(http).get(`${base}/leads`).set('Cookie', admin).expect(200);
  assert.ok(
    !(pipeline.body.leads as { id: string }[]).some((row) => row.id === lead.body.id),
    'a booked enquiry belongs to the customer book, not the pipeline',
  );
  step('the enquiry has become a customer and left the pipeline');

  // --- chasing the money -----------------------------------------------------
  const chase = await request(http)
    .post(`${base}/follow-ups`)
    .set('Cookie', admin)
    .send({ invoiceId: invoice.body.id, dueAt: '2026-09-25', reason: 'Chase the balance' })
    .expect(201);
  assert.equal(chase.body.kind, 'INVOICE');
  assert.ok(chase.body.sequence >= 1, 'numbered, not random');

  const inMenu = await request(http)
    .get(`${base}/follow-ups`)
    .query({ kind: 'INVOICE' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok(
    (inMenu.body as { id: string }[]).some((row) => row.id === chase.body.id),
    'and it is in the list straight away',
  );
  step('an invoice can be chased, and the chase appears at once');

  // --- what the global search has to find -----------------------------------
  for (const term of ['Regression', 'Bali', '9876543210']) {
    const found = await request(http)
      .get(`${base}/leads`)
      .query({ search: term, includeConverted: true })
      .set('Cookie', admin)
      .expect(200);
    assert.ok(
      (found.body.leads as { id: string }[]).some((row) => row.id === lead.body.id),
      `search by "${term}" finds them`,
    );
  }
  step('search finds them by name, destination and phone number');

  await app.close();
  console.log('All regression walk checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
