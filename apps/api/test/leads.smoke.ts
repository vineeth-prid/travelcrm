/**
 * End-to-end smoke test of lead management: validation, duplicate protection,
 * the stage machine, assignment rules, the timeline — and, most importantly,
 * that role-based access is enforced by the API rather than by the navigation.
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
  whatsapp: '+91 98765 43210',
  email: 'priya@example.com',
  city: 'Kochi',
  country: 'India',
  destination: 'Dubai',
  departureCity: 'Kochi',
  travelStart: '2026-12-10',
  travelEnd: '2026-12-15',
  adults: '2',
  children: '2',
  childAges: [8, 12],
  tripType: 'Family',
  hotelCategory: '4 star',
  transportRequired: true,
  flightRequired: true,
  activityRequirements: 'Desert safari',
  budget: '150000',
  currency: 'INR',
  source: 'MANUAL',
  priority: 'HIGH',
  tags: ['Family'],
  nextAction: 'Send a shortlist of hotels',
  nextFollowUpAt: '2026-08-20',
};

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');

  const { app, prisma, base } = await bootApp();
  const http = app.getHttpServer() as Parameters<typeof request>[0];

  const signIn = async (email: string, password: string): Promise<string> => {
    const response = await request(http)
      .post(`${base}/login`)
      .send({ email, password })
      .expect(200);
    const cookie = sessionCookieFrom(response.headers);
    assert.ok(cookie, `signed in as ${email}`);
    return cookie;
  };

  const admin = await signIn('admin@travelcrm.test', ADMIN_PASSWORD);
  const employee = await signIn(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  const adminId = prisma.users[0]!.id;
  const employeeId = prisma.users[1]!.id;

  // --- authentication --------------------------------------------------------
  await request(http).get(`${base}/leads`).expect(401);
  await request(http).post(`${base}/leads`).send(LEAD_BODY).expect(401);

  // --- validation ------------------------------------------------------------
  const noName = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, customerName: '' })
    .expect(400);
  assert.ok(noName.body.details.customerName?.length);

  const noContact = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, phone: '', whatsapp: '', email: '' })
    .expect(400);
  assert.ok(noContact.body.details.phone?.length, 'some way to reach the customer is required');

  const backwardsDates = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, travelStart: '2026-12-15', travelEnd: '2026-12-10' })
    .expect(400);
  assert.ok(backwardsDates.body.details.travelEnd?.length);

  const tooManyAges = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, children: 1, childAges: [8, 12] })
    .expect(400);
  assert.ok(tooManyAges.body.details.childAges?.length);

  // --- create ----------------------------------------------------------------
  const created = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', employee)
    .send(LEAD_BODY)
    .expect(201);

  const leadId: string = created.body.id;
  assert.match(created.body.reference, /^TDH-L-\d{5}$/, 'a human reference is issued');
  assert.equal(created.body.stage, 'NEW', 'every lead starts at NEW');
  assert.equal(created.body.customer.name, 'Priya Nair');
  assert.equal(created.body.destination, 'Dubai');
  assert.equal(created.body.travelStart, '2026-12-10', 'dates come back as plain days');
  assert.equal(created.body.adults, 2, 'form strings are coerced to numbers');
  assert.equal(created.body.budget, 150000);
  assert.deepEqual(created.body.childAges, [8, 12]);
  assert.equal(created.body.transportRequired, true);
  assert.equal(
    created.body.assignedTo?.id,
    employeeId,
    'an employee creating a lead keeps it themselves',
  );

  // --- duplicate protection --------------------------------------------------
  const duplicate = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    // Same person, written differently: no country code, no spaces.
    .send({ ...LEAD_BODY, phone: '9876543210', whatsapp: '', email: '' })
    .expect(409);
  assert.match(duplicate.body.message, /already exists/i);
  assert.match(duplicate.body.message, /Priya Nair/, 'the refusal names who it collided with');
  assert.equal(prisma.leads.length, 1, 'nothing was created');

  // The form gets the detail from the check the consultant's typing triggers.
  const warned = await request(http)
    .get(`${base}/leads/duplicates`)
    .query({ phone: '9876543210' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(warned.body.matches.length, 1);
  assert.equal(warned.body.matches[0].customerName, 'Priya Nair');
  assert.deepEqual(warned.body.matches[0].matchedOn, ['phone']);
  assert.equal(warned.body.matches[0].latestLeadReference, created.body.reference);
  assert.equal(warned.body.matches[0].leadCount, 1);

  const byEmail = await request(http)
    .get(`${base}/leads/duplicates`)
    .query({ email: 'PRIYA@example.com' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byEmail.body.matches.length, 1, 'email matching ignores case');

  const unknownNumber = await request(http)
    .get(`${base}/leads/duplicates`)
    .query({ phone: '+91 90000 00000' })
    .set('Cookie', admin)
    .expect(200);
  assert.deepEqual(unknownNumber.body.matches, []);

  // Confirming goes ahead, and does not invent a second customer record.
  const confirmed = await request(http)
    .post(`${base}/leads?allowDuplicate=true`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, customerId: created.body.customer.id, destination: 'Singapore' })
    .expect(201);
  assert.equal(confirmed.body.customer.id, created.body.customer.id, 'the customer is reused');
  assert.equal(prisma.customers.length, 1, 'one person, two trips');
  assert.equal(confirmed.body.destination, 'Singapore');
  assert.equal(confirmed.body.assignedTo, null, 'an admin can create an unassigned lead');

  // --- who can see what ------------------------------------------------------
  const adminList = await request(http).get(`${base}/leads`).set('Cookie', admin).expect(200);
  assert.equal(adminList.body.total, 2, 'an admin sees the whole pipeline');

  const employeeList = await request(http).get(`${base}/leads`).set('Cookie', employee).expect(200);
  assert.equal(employeeList.body.total, 1, 'an employee sees only their own leads');
  assert.equal(employeeList.body.leads[0].id, leadId);

  await request(http).get(`${base}/leads/${confirmed.body.id}`).set('Cookie', employee).expect(404);
  await request(http).get(`${base}/leads/${confirmed.body.id}`).set('Cookie', admin).expect(200);

  // --- assignment ------------------------------------------------------------
  const grab = await request(http)
    .patch(`${base}/leads/${leadId}/assign`)
    .set('Cookie', employee)
    .send({ assignedToId: adminId })
    .expect(403);
  assert.match(grab.body.message, /only assign leads to yourself/i);

  const reassigned = await request(http)
    .patch(`${base}/leads/${leadId}/assign`)
    .set('Cookie', admin)
    .send({ assignedToId: adminId })
    .expect(200);
  assert.equal(reassigned.body.assignedTo.id, adminId);

  // Reassignment does not erase the lead from the consultant who opened it —
  // they may be mid-conversation with the customer. Leads they never touched
  // stay invisible, which is the check above.
  await request(http).get(`${base}/leads/${leadId}`).set('Cookie', employee).expect(200);

  const staff = await request(http).get(`${base}/staff`).set('Cookie', employee).expect(200);
  assert.equal(staff.body.length, 1, 'an employee can only assign to themselves');
  assert.equal(staff.body[0].id, employeeId);
  assert.equal((await request(http).get(`${base}/staff`).set('Cookie', admin)).body.length, 2);

  // --- the stage machine -----------------------------------------------------
  const lostWithoutReason = await request(http)
    .patch(`${base}/leads/${leadId}/stage`)
    .set('Cookie', admin)
    .send({ stage: 'LOST' })
    .expect(400);
  assert.ok(lostWithoutReason.body.details.lostReason?.length, 'a loss must say why');

  await request(http)
    .patch(`${base}/leads/${leadId}/stage`)
    .set('Cookie', admin)
    .send({ stage: 'QUALIFIED' })
    .expect(200);

  const lost = await request(http)
    .patch(`${base}/leads/${leadId}/stage`)
    .set('Cookie', admin)
    .send({ stage: 'LOST', lostReason: 'BUDGET', lostNotes: 'Wanted it under a lakh.' })
    .expect(200);
  assert.equal(lost.body.stage, 'LOST');
  assert.equal(lost.body.lostReason, 'BUDGET');

  const revived = await request(http)
    .patch(`${base}/leads/${leadId}/stage`)
    .set('Cookie', admin)
    .send({ stage: 'NEGOTIATION' })
    .expect(200);
  assert.equal(revived.body.lostReason, null, 'leaving LOST clears the reason');
  assert.equal(revived.body.lostNotes, null);

  // --- the timeline ----------------------------------------------------------
  await request(http)
    .post(`${base}/leads/${leadId}/activities`)
    .set('Cookie', admin)
    .send({ note: 'Called; asked for a Dubai option without flights.' })
    .expect(201);

  const timeline = (
    await request(http).get(`${base}/leads/${leadId}/activities`).set('Cookie', admin).expect(200)
  ).body as { type: string; summary: string; detail: string | null }[];

  const types = timeline.map((entry) => entry.type);
  assert.equal(types[types.length - 1], 'LEAD_CREATED', 'the record starts at creation');
  assert.equal(types[0], 'NOTE', 'newest first');
  assert.ok(types.includes('ASSIGNED'));
  assert.equal(types.filter((type) => type === 'STAGE_CHANGED').length, 3);
  assert.ok(
    timeline.some((entry) => entry.summary.includes('Qualified → Lost — Budget')),
    'the loss and its reason are on the record',
  );

  const empty = await request(http)
    .post(`${base}/leads/${leadId}/activities`)
    .set('Cookie', admin)
    .send({ note: '   ' })
    .expect(400);
  assert.ok(empty.body.details.note?.length);

  // --- search, filter and paging ---------------------------------------------
  const byDestination = await request(http)
    .get(`${base}/leads`)
    .query({ destination: 'singapore' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byDestination.body.total, 1, 'destination filtering is case-insensitive');

  const byReference = await request(http)
    .get(`${base}/leads`)
    .query({ search: created.body.reference })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byReference.body.total, 1);

  const byPhone = await request(http)
    .get(`${base}/leads`)
    .query({ search: '9876543210' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byPhone.body.total, 2, 'both trips belong to that number');

  const byStage = await request(http)
    .get(`${base}/leads`)
    .query({ stage: 'NEGOTIATION' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(byStage.body.total, 1);

  const mine = await request(http)
    .get(`${base}/leads`)
    .query({ assignedToId: adminId })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(mine.body.total, 1);

  const paged = await request(http)
    .get(`${base}/leads`)
    .query({ page: 2, pageSize: 1 })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(paged.body.leads.length, 1);
  assert.equal(paged.body.total, 2, 'the total counts every match, not just the page');
  assert.equal(paged.body.page, 2);

  const badPageSize = await request(http)
    .get(`${base}/leads`)
    .query({ pageSize: 5000 })
    .set('Cookie', admin)
    .expect(400);
  assert.ok(badPageSize.body.details.pageSize?.length);

  // --- overdue follow-ups ----------------------------------------------------
  const overdue = await request(http)
    .get(`${base}/leads`)
    .query({ overdue: true })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(
    overdue.body.total,
    0,
    'a follow-up dated in the future is not overdue (LEAD_BODY uses 2026-08-20)',
  );

  prisma.leads[0]!.nextFollowUpAt = new Date('2020-01-01T00:00:00.000Z');
  const nowOverdue = await request(http)
    .get(`${base}/leads`)
    .query({ overdue: true })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(nowOverdue.body.total, 1);

  prisma.leads[0]!.stage = 'WON';
  const closedNotOverdue = await request(http)
    .get(`${base}/leads`)
    .query({ overdue: true })
    .set('Cookie', admin)
    .expect(200);
  assert.equal(closedNotOverdue.body.total, 0, 'a closed lead is never chased');

  // --- editing ---------------------------------------------------------------
  const edited = await request(http)
    .patch(`${base}/leads/${leadId}`)
    .set('Cookie', admin)
    .send({ ...LEAD_BODY, destination: 'Abu Dhabi', budget: '175000' })
    .expect(200);
  assert.equal(edited.body.destination, 'Abu Dhabi');
  assert.equal(edited.body.budget, 175000);
  assert.equal(edited.body.stage, 'WON', 'editing the body never moves the stage');

  // --- missing lead ----------------------------------------------------------
  await request(http)
    .get(`${base}/leads/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', admin)
    .expect(404);

  await app.close();
  console.log('All lead smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
