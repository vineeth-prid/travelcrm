/**
 * End-to-end smoke test of invoicing and payments.
 *
 * The centre of it is §49: a ₹150,000 invoice, part-paid twice, must report
 * ₹75,000 outstanding and PARTIALLY_PAID. Around that sit the rules that keep
 * the books trustworthy — server-computed totals, immutability once issued,
 * no overpayment, no cancelling a paid bill.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';
process.env.COMPANY_NAME = 'Tour De India Holidays';
process.env.COMPANY_CONTACT = 'hello@tourdeindia.test';
process.env.COMPANY_BANK_DETAILS = 'HDFC Bank · A/C 1234567890 · IFSC HDFC0001234';

const stored = new Map<string, Buffer>();

function createStorageFake() {
  return {
    put: (key: string, body: Buffer) => {
      stored.set(key, body);
      return Promise.resolve();
    },
    presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}`),
  };
}

/** See proposals.smoke.ts — pdfkit Flate-compresses its content streams. */
function pdfText(pdf: Buffer): string {
  const parts: string[] = [];
  let cursor = 0;

  for (;;) {
    const start = pdf.indexOf('stream', cursor);
    if (start === -1) break;
    const end = pdf.indexOf('endstream', start);
    if (end === -1) break;

    let from = start + 'stream'.length;
    if (pdf[from] === 0x0d) from += 1;
    if (pdf[from] === 0x0a) from += 1;

    try {
      const inflated = inflateSync(pdf.subarray(from, end)).toString('latin1');
      for (const match of inflated.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g)) {
        if (match[1] !== undefined) {
          parts.push(match[1].replace(/\\([()\\])/g, '$1'));
          continue;
        }
        const hex = (match[2] ?? '').replace(/\s+/g, '');
        parts.push(
          (hex.match(/../g) ?? [])
            .map((pair) => String.fromCharCode(Number.parseInt(pair, 16)))
            .join(''),
        );
      }
    } catch {
      // Not a Flate stream.
    }

    cursor = end + 'endstream'.length;
  }

  return parts.join('');
}

/** §49: the invoice is ₹150,000 with no tax. */
const INVOICE_BODY = {
  issueDate: '2026-09-01',
  dueDate: '2026-09-30',
  packageTitle: 'Dubai Family Holiday — 5 Nights',
  destination: 'Dubai',
  travelStart: '2026-12-10',
  travelEnd: '2026-12-15',
  description: 'Four-star hotel, airport transfers and a desert safari.',
  currency: 'INR',
  packageAmount: '150000',
  discountAmount: '0',
  billingName: 'Priya Nair',
  billingAddress: '12 Marine Drive\nKochi 682031',
  billingEmail: 'priya@example.com',
  billingPhone: '+91 98765 43210',
  paymentTerms: 'Balance due 30 days before departure.',
};

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');
  const { InvoicePdfService } = await import('../src/invoices/invoice-pdf.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(StorageService).useValue(createStorageFake()),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  /** Everything ever handed to the invoice renderer. */
  const rendered: Record<string, unknown>[] = [];
  const pdfService = app.get(InvoicePdfService);
  const realRender = pdfService.render.bind(pdfService);
  pdfService.render = (data: Parameters<typeof realRender>[0]) => {
    rendered.push(data as unknown as Record<string, unknown>);
    return realRender(data);
  };

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

  const lead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', employee)
    .send({ customerName: 'Priya Nair', phone: '+91 98765 43210', destination: 'Dubai' })
    .expect(201);
  const leadId: string = lead.body.id;
  const customerCountBefore = prisma.customers.length;

  // --- authentication --------------------------------------------------------
  await request(http).get(`${base}/invoices`).expect(401);
  await request(http).post(`${base}/leads/${leadId}/invoices`).send(INVOICE_BODY).expect(401);

  // --- validation ------------------------------------------------------------
  const noTitle = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, packageTitle: '' })
    .expect(400);
  assert.ok(noTitle.body.details.packageTitle?.length);

  const bigDiscount = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, discountAmount: '200000' })
    .expect(400);
  assert.ok(
    bigDiscount.body.details.discountAmount?.length,
    'a discount cannot exceed the package',
  );

  const backwards = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, issueDate: '2026-09-30', dueDate: '2026-09-01' })
    .expect(400);
  assert.ok(backwards.body.details.dueDate?.length);

  // --- create ----------------------------------------------------------------
  const created = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send(INVOICE_BODY)
    .expect(201);

  const invoiceId: string = created.body.id;
  assert.match(created.body.reference, /^TDH-INV-\d{5}$/);
  assert.equal(created.body.status, 'DRAFT');
  assert.equal(created.body.totals.packageAmount, 150_000);
  assert.equal(created.body.totals.taxAmount, 0, 'no tax rate means no tax');
  assert.equal(created.body.totals.taxRateBps, null);
  assert.equal(created.body.totals.totalAmount, 150_000);
  assert.equal(created.body.outstanding, 150_000);
  assert.equal(created.body.paymentStatus, 'UNPAID');

  // §35F: converting a lead to a booking must not invent a second customer.
  assert.equal(prisma.customers.length, customerCountBefore, 'no duplicate customer was created');
  assert.equal(created.body.customerId, prisma.leads[0]!.customerId, 'the lead’s customer is used');

  // A client-supplied total must never be trusted over the calculation.
  const tampered = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, totalAmount: 1, taxAmount: 99_999 })
    .expect(201);
  assert.equal(tampered.body.totals.totalAmount, 150_000);
  assert.equal(tampered.body.totals.taxAmount, 0);

  // --- tax, when it applies --------------------------------------------------
  const taxed = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, discountAmount: '10000', taxRateBps: '1800' })
    .expect(201);

  // 150,000 − 10,000 = 140,000; 18% of that is 25,200; total 165,200.
  assert.equal(taxed.body.totals.netAmount, 140_000, 'tax applies after the discount');
  assert.equal(taxed.body.totals.taxAmount, 25_200);
  assert.equal(taxed.body.totals.totalAmount, 165_200);

  const oddRate = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, packageAmount: '9999', taxRateBps: '750' })
    .expect(201);
  assert.equal(oddRate.body.totals.taxAmount, 750, '7.5% of 9,999 rounds to 750');
  assert.equal(oddRate.body.totals.totalAmount, 10_749);

  await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, taxRateBps: '20000' })
    .expect(400);

  // --- the PDF ---------------------------------------------------------------
  await request(http)
    .post(`${base}/invoices/${invoiceId}/issue`)
    .set('Cookie', employee)
    .expect(400);

  const generated = await request(http)
    .post(`${base}/invoices/${invoiceId}/generate`)
    .set('Cookie', employee)
    .expect(200);

  assert.equal(generated.body.invoice.hasPdf, true);
  assert.match(generated.body.pdfUrl, /^https:\/\/files\.test\//);

  const pdf = stored.get(`invoices/${invoiceId}.pdf`);
  assert.ok(pdf, 'the PDF was stored under the invoice');
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');

  // Nothing internal can reach the renderer: the type has no field for it.
  const data = rendered[0]!;
  for (const forbidden of ['actualCost', 'grossProfit', 'marginPercent', 'financials']) {
    assert.ok(!(forbidden in data), `the invoice renderer must not receive "${forbidden}"`);
  }

  const text = pdfText(pdf);
  if (text.includes('Dubai')) {
    assert.ok(text.includes('INR 1,50,000'), 'the customer sees the total');
    assert.ok(text.includes('TDH-INV-'), 'the invoice is identified');
    assert.ok(text.includes('Priya Nair'), 'and who it is billed to');
    assert.ok(text.includes('HDFC'), 'with how to pay');
    assert.ok(!text.includes('Tax ('), 'no tax line when no tax applies');
  }

  // --- issuing freezes it ----------------------------------------------------
  const issued = await request(http)
    .post(`${base}/invoices/${invoiceId}/issue`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(issued.body.status, 'ISSUED');

  // Billing a customer means the deal was won.
  const wonLead = await request(http)
    .get(`${base}/leads/${leadId}`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(wonLead.body.stage, 'WON');

  const editIssued = await request(http)
    .patch(`${base}/invoices/${invoiceId}`)
    .set('Cookie', employee)
    .send(INVOICE_BODY)
    .expect(400);
  assert.match(editIssued.body.message, /cannot be changed/i);

  // --- §49: the payment arithmetic ------------------------------------------
  const first = await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({
      paidAt: '2026-09-05',
      amount: '50000',
      method: 'BANK_TRANSFER',
      externalReference: 'NEFT001',
    })
    .expect(201);

  assert.equal(first.body.amountPaid, 50_000);
  assert.equal(first.body.outstanding, 100_000);
  assert.equal(first.body.paymentStatus, 'PARTIALLY_PAID');
  assert.match(first.body.payments[0].reference, /^TDH-PAY-\d{5}$/);

  const second = await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-12', amount: '25000', method: 'UPI', externalReference: 'UPI-778' })
    .expect(201);

  // The exact figures from the brief.
  assert.equal(second.body.totals.totalAmount, 150_000);
  assert.equal(second.body.amountPaid, 75_000);
  assert.equal(second.body.outstanding, 75_000);
  assert.equal(second.body.paymentStatus, 'PARTIALLY_PAID');
  assert.equal(second.body.payments.length, 2);

  // Overpayment is refused — it is nearly always a typo.
  const over = await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-13', amount: '80000', method: 'CASH' })
    .expect(400);
  assert.ok(over.body.details.amount?.length);
  assert.match(over.body.details.amount[0], /75,000/, 'and says what is actually outstanding');

  const zero = await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-13', amount: '0', method: 'CASH' })
    .expect(400);
  assert.ok(zero.body.details.amount?.length);

  // A paid invoice cannot be cancelled — that needs a credit note.
  const cancelPaid = await request(http)
    .post(`${base}/invoices/${invoiceId}/cancel`)
    .set('Cookie', employee)
    .expect(400);
  assert.match(cancelPaid.body.message, /payments recorded/i);

  // Settling it exactly.
  const settled = await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-20', amount: '75000', method: 'CARD' })
    .expect(201);

  assert.equal(settled.body.amountPaid, 150_000);
  assert.equal(settled.body.outstanding, 0);
  assert.equal(settled.body.paymentStatus, 'PAID');

  await request(http)
    .post(`${base}/invoices/${invoiceId}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-21', amount: '1', method: 'CASH' })
    .expect(400);

  // The whole trail is on the lead timeline.
  const timeline = (
    await request(http)
      .get(`${base}/leads/${leadId}/activities`)
      .set('Cookie', employee)
      .expect(200)
  ).body as { type: string; summary: string }[];

  assert.equal(timeline.filter((entry) => entry.type === 'PAYMENT_RECEIVED').length, 3);
  assert.ok(timeline.some((entry) => entry.type === 'INVOICE_GENERATED'));
  assert.ok(
    timeline.some((entry) => entry.summary.includes('paid in full')),
    'the moment it was settled is on the record',
  );

  // --- overdue is derived, not stored ---------------------------------------
  const unpaid = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send({ ...INVOICE_BODY, issueDate: '2020-01-01', dueDate: '2020-01-31' })
    .expect(201);

  assert.equal(unpaid.body.paymentStatus, 'UNPAID', 'a draft is never overdue');

  await request(http).post(`${base}/invoices/${unpaid.body.id}/generate`).set('Cookie', employee);
  const issuedOld = await request(http)
    .post(`${base}/invoices/${unpaid.body.id}/issue`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(issuedOld.body.paymentStatus, 'OVERDUE', 'once issued and past due, it is overdue');

  // A fully paid invoice is never overdue, whatever the date says.
  assert.equal(settled.body.paymentStatus, 'PAID');

  // --- draft invoices take no money -----------------------------------------
  const draft = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', employee)
    .send(INVOICE_BODY)
    .expect(201);

  const onDraft = await request(http)
    .post(`${base}/invoices/${draft.body.id}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: '2026-09-05', amount: '1000', method: 'CASH' })
    .expect(400);
  assert.match(onDraft.body.message, /issue the invoice/i);

  const cancelled = await request(http)
    .post(`${base}/invoices/${draft.body.id}/cancel`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(cancelled.body.status, 'CANCELLED');

  // --- filtering and access --------------------------------------------------
  const paidOnly = await request(http)
    .get(`${base}/invoices`)
    .query({ paymentStatus: 'PAID' })
    .set('Cookie', employee)
    .expect(200);
  assert.equal(paidOnly.body.length, 1);
  assert.equal(paidOnly.body[0].id, invoiceId);

  const byReference = await request(http)
    .get(`${base}/invoices`)
    .query({ search: created.body.reference })
    .set('Cookie', employee)
    .expect(200);
  assert.equal(byReference.body.length, 1);

  // Somebody else's lead is invisible.
  const otherLead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ customerName: 'Someone Else', phone: '+91 90000 11111' })
    .expect(201);
  const otherInvoice = await request(http)
    .post(`${base}/leads/${otherLead.body.id}/invoices`)
    .set('Cookie', admin)
    .send({ ...INVOICE_BODY, billingName: 'Someone Else' })
    .expect(201);

  await request(http)
    .get(`${base}/invoices/${otherInvoice.body.id}`)
    .set('Cookie', employee)
    .expect(404);
  await request(http)
    .get(`${base}/invoices/${otherInvoice.body.id}`)
    .set('Cookie', admin)
    .expect(200);

  // An employee cannot bill against a lead that is not theirs.
  await request(http)
    .post(`${base}/leads/${otherLead.body.id}/invoices`)
    .set('Cookie', employee)
    .send(INVOICE_BODY)
    .expect(404);

  // --- a proposal from another lead cannot be cited --------------------------
  const strayProposal = await request(http)
    .post(`${base}/leads/${otherLead.body.id}/proposals`)
    .set('Cookie', admin)
    .send({
      title: 'Elsewhere',
      validUntil: '2027-01-01',
      currency: 'INR',
      sellingPrice: '1000',
      actualCost: '500',
    })
    .expect(201);

  const wrongProposal = await request(http)
    .post(`${base}/leads/${leadId}/invoices`)
    .set('Cookie', admin)
    .send({ ...INVOICE_BODY, proposalId: strayProposal.body.id })
    .expect(400);
  assert.match(wrongProposal.body.message, /does not belong to this lead/i);

  // --- missing invoice -------------------------------------------------------
  await request(http)
    .get(`${base}/invoices/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', admin)
    .expect(404);

  await app.close();
  console.log('All invoice smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
