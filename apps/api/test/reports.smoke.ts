/**
 * End-to-end smoke test of the dashboards.
 *
 * Two things matter. First that the arithmetic is right, because an
 * administrator makes decisions from these numbers — in particular that the
 * average and the weighted margin are genuinely different figures and both are
 * labelled. Second that §12 and §26 hold: company-wide money is admin-only,
 * and an employee's own performance row carries no margin unless they have
 * been given permission.
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

function createStorageFake() {
  return {
    put: () => Promise.resolve(),
    presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}`),
  };
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
  const employeeId = prisma.users[1]!.id;

  // --- §12: company-wide money is not an employee's business ---------------
  await request(http).get(`${base}/reports/dashboard`).set('Cookie', employee).expect(403);
  await request(http).get(`${base}/reports/dashboard`).expect(401);
  await request(http).get(`${base}/reports/performance`).expect(401);

  // --- an empty period reports zeroes, not errors --------------------------
  const empty = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(empty.body.sales.totalLeads, 0);
  assert.equal(empty.body.revenue.proposedValue, 0);
  assert.equal(
    empty.body.profitability.accepted.weightedMarginPercent,
    0,
    'no proposals means no margin, not NaN',
  );
  assert.equal(
    empty.body.sales.conversionRate,
    0,
    'and no conversion rate, not a division by zero',
  );

  // --- the fixture ---------------------------------------------------------
  // Two proposals chosen so the average and the weighted margin disagree, which
  // is the whole reason §25 asks for both:
  //   small: 10,000 selling / 5,000 cost  → 50% margin
  //   large: 500,000 selling / 450,000    → 10% margin
  //   average  = 30.0%
  //   weighted = 55,000 / 510,000 = 10.8%
  const deals = [
    { name: 'Small Trip', phone: '+91 90000 00001', selling: '10000', cost: '5000' },
    { name: 'Large Trip', phone: '+91 90000 00002', selling: '500000', cost: '450000' },
  ];

  const proposalIds: string[] = [];
  const leadIds: string[] = [];

  for (const deal of deals) {
    const lead = await request(http)
      .post(`${base}/leads`)
      .set('Cookie', employee)
      .send({ customerName: deal.name, phone: deal.phone, destination: 'Dubai' })
      .expect(201);
    leadIds.push(lead.body.id);

    const proposal = await request(http)
      .post(`${base}/leads/${lead.body.id}/proposals`)
      .set('Cookie', employee)
      .send({
        title: `${deal.name} package`,
        validUntil: '2027-06-30',
        currency: 'INR',
        sellingPrice: deal.selling,
        actualCost: deal.cost,
      })
      .expect(201);
    proposalIds.push(proposal.body.id);

    await request(http)
      .post(`${base}/proposals/${proposal.body.id}/generate`)
      .set('Cookie', employee)
      .expect(200);
    await request(http)
      .post(`${base}/proposals/${proposal.body.id}/submit`)
      .set('Cookie', employee)
      .expect(200);
  }

  // --- follow-ups, before the proposals are decided ------------------------
  // Two submitted proposals scheduled four follow-ups each.
  const whileOpen = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(
    whileOpen.body.followUps.dueToday + whileOpen.body.followUps.upcoming,
    8,
    'every scheduled follow-up is accounted for',
  );
  assert.equal(whileOpen.body.followUps.missed, 0);

  // Both accepted, so the accepted and submitted populations coincide here.
  for (const id of proposalIds) {
    await request(http)
      .patch(`${base}/proposals/${id}/status`)
      .set('Cookie', employee)
      .send({ status: 'ACCEPTED' })
      .expect(200);
  }

  const dashboard = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  // --- sales ---------------------------------------------------------------
  assert.equal(dashboard.body.sales.totalLeads, 2);
  assert.equal(dashboard.body.sales.proposalsCreated, 2);
  assert.equal(dashboard.body.sales.proposalsSent, 2);
  assert.equal(dashboard.body.sales.proposalsAccepted, 2);
  assert.equal(dashboard.body.sales.wonLeads, 2, 'an accepted proposal wins its lead');
  assert.equal(dashboard.body.sales.conversionRate, 100, 'two won, none lost');

  // --- profitability, both figures, both labelled --------------------------
  const accepted = dashboard.body.profitability.accepted;
  assert.equal(accepted.population, 'ACCEPTED', 'the population is stated, not implied');
  assert.equal(accepted.proposalCount, 2);
  assert.equal(accepted.sellingTotal, 510_000);
  assert.equal(accepted.costTotal, 455_000);
  assert.equal(accepted.grossProfit, 55_000);
  assert.equal(accepted.averageMarginPercent, 30, '(50 + 10) ÷ 2');
  assert.equal(accepted.weightedMarginPercent, 10.8, '55,000 ÷ 510,000 — what was actually kept');
  assert.notEqual(
    accepted.averageMarginPercent,
    accepted.weightedMarginPercent,
    'the two disagree, which is exactly why both are reported',
  );

  assert.equal(dashboard.body.profitability.submitted.population, 'SUBMITTED');
  assert.equal(dashboard.body.revenue.proposedValue, 510_000);
  assert.equal(dashboard.body.revenue.acceptedValue, 510_000);

  // --- a rejected proposal leaves the accepted population ------------------
  await request(http)
    .patch(`${base}/proposals/${proposalIds[1]!}/status`)
    .set('Cookie', employee)
    .send({ status: 'REJECTED' })
    .expect(200);

  const afterRejection = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(afterRejection.body.profitability.accepted.proposalCount, 1);
  assert.equal(afterRejection.body.profitability.accepted.sellingTotal, 10_000);
  assert.equal(
    afterRejection.body.profitability.accepted.weightedMarginPercent,
    50,
    'only the small, high-margin deal is left',
  );
  assert.equal(
    afterRejection.body.profitability.submitted.proposalCount,
    2,
    'but both were still offered',
  );
  assert.equal(afterRejection.body.sales.proposalsRejected, 1);

  // --- revenue: invoiced, collected, outstanding ---------------------------
  const invoice = await request(http)
    .post(`${base}/leads/${leadIds[0]!}/invoices`)
    .set('Cookie', employee)
    .send({
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: '2027-06-30',
      packageTitle: 'Small Trip package',
      currency: 'INR',
      packageAmount: '10000',
      discountAmount: '0',
      billingName: 'Small Trip',
    })
    .expect(201);

  await request(http).post(`${base}/invoices/${invoice.body.id}/generate`).set('Cookie', employee);
  await request(http)
    .post(`${base}/invoices/${invoice.body.id}/issue`)
    .set('Cookie', employee)
    .expect(200);
  await request(http)
    .post(`${base}/invoices/${invoice.body.id}/payments`)
    .set('Cookie', employee)
    .send({ paidAt: new Date().toISOString().slice(0, 10), amount: '4000', method: 'UPI' })
    .expect(201);

  const withMoney = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(withMoney.body.revenue.invoicedAmount, 10_000);
  assert.equal(withMoney.body.revenue.collectedAmount, 4_000);
  assert.equal(withMoney.body.revenue.outstandingAmount, 6_000);
  assert.equal(withMoney.body.revenue.overdueAmount, 0, 'not yet due, so not yet overdue');

  // --- follow-ups, once the proposals are decided --------------------------
  // A decided proposal has nothing left to chase, so its schedule was
  // cancelled — and the dashboard reflects that rather than showing work that
  // nobody should do.
  assert.equal(
    withMoney.body.followUps.dueToday + withMoney.body.followUps.upcoming,
    0,
    'a decided proposal leaves no follow-ups outstanding',
  );
  assert.equal(withMoney.body.followUps.missed, 0);

  // --- expenses come from the expense summary, not a second calculation ----
  const categories = await request(http)
    .get(`${base}/expenses/categories`)
    .set('Cookie', admin)
    .expect(200);

  await request(http)
    .post(`${base}/expenses`)
    .set('Cookie', admin)
    .send({
      spentAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10),
      categoryId: categories.body[0].id,
      description: 'Instagram ads',
      amount: '15000',
      currency: 'INR',
      method: 'CARD',
    })
    .expect(201);

  const withExpenses = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(withExpenses.body.expenses.periodTotal, 15_000);
  assert.equal(withExpenses.body.expenses.currentMonth, 15_000);
  assert.equal(withExpenses.body.expenses.byCategory.length, 1);
  assert.equal(withExpenses.body.expenses.byCategory[0].share, 100);

  // --- currencies are never added together ---------------------------------
  const dollarLead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ customerName: 'Dollar Trip', phone: '+91 90000 00003' })
    .expect(201);

  await request(http)
    .post(`${base}/leads/${dollarLead.body.id}/proposals`)
    .set('Cookie', admin)
    .send({
      title: 'Dollar package',
      validUntil: '2027-06-30',
      currency: 'USD',
      sellingPrice: '9000',
      actualCost: '4000',
    })
    .expect(201);

  const mixed = await request(http)
    .get(`${base}/reports/dashboard`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(mixed.body.currency, 'INR', 'the dominant currency by value');
  assert.equal(mixed.body.revenue.proposedValue, 510_000, 'dollars are not added to rupees');
  assert.deepEqual(mixed.body.otherCurrencies, ['USD'], 'but they are named');

  const inDollars = await request(http)
    .get(`${base}/reports/dashboard`)
    .query({ currency: 'USD' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(inDollars.body.revenue.proposedValue, 9_000);
  assert.equal(inDollars.body.profitability.submitted.proposalCount, 0, 'it was never submitted');

  // --- §26: performance, and who may see margin ----------------------------
  const asAdmin = await request(http)
    .get(`${base}/reports/performance`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(asAdmin.body.rows.length, 2, 'an admin sees every consultant');

  const employeeRow = (asAdmin.body.rows as { user: { id: string } }[]).find(
    (row) => row.user.id === employeeId,
  ) as unknown as {
    leadsAssigned: number;
    proposalsCreated: number;
    proposalValue: number;
    revenueGenerated: number;
    collected: number;
    outstanding: number;
    averageMarginPercent: number | null;
    conversionRate: number;
  };

  assert.ok(employeeRow);
  assert.equal(employeeRow.leadsAssigned, 2);
  assert.equal(employeeRow.proposalsCreated, 2);
  assert.equal(employeeRow.proposalValue, 510_000);
  assert.equal(employeeRow.revenueGenerated, 10_000);
  assert.equal(employeeRow.collected, 4_000);
  assert.equal(employeeRow.outstanding, 6_000);
  assert.equal(employeeRow.conversionRate, 100);
  assert.equal(employeeRow.averageMarginPercent, 50, 'an admin sees margin');

  // The same consultant, looking at themselves, without the permission.
  assert.equal(prisma.users[1]!.canViewOwnProfitability, false);

  const asEmployee = await request(http)
    .get(`${base}/reports/performance`)
    .set('Cookie', employee)
    .expect(200);

  assert.equal(asEmployee.body.rows.length, 1, 'an employee sees only themselves');
  assert.equal(asEmployee.body.rows[0].user.id, employeeId);
  assert.equal(
    asEmployee.body.rows[0].averageMarginPercent,
    null,
    'and no margin without the permission',
  );
  assert.equal(
    asEmployee.body.rows[0].revenueGenerated,
    10_000,
    'but the money they brought in is theirs to see',
  );
  assert.ok(
    !JSON.stringify(asEmployee.body).includes('455000'),
    'no cost figure reaches them by any route',
  );

  prisma.users[1]!.canViewOwnProfitability = true;
  const permitted = await request(http)
    .get(`${base}/reports/performance`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(permitted.body.rows[0].averageMarginPercent, 50, 'the permission reveals it');
  assert.equal(permitted.body.rows.length, 1, 'and still only themselves');

  await app.close();
  console.log('All report smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
