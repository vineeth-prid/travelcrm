/**
 * End-to-end smoke test of the follow-up engine, notifications and SMTP.
 *
 * The claims worth proving here are the ones that are easy to get wrong and
 * expensive to get wrong: that submitting a proposal schedules the right days,
 * that the scheduler is safe to run repeatedly, and above all that a missed
 * follow-up produces exactly one email no matter how many times the sweep runs.
 *
 * SMTP is faked at the transport, so the notification records, the dedupe and
 * the template rendering are all real.
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
process.env.COMPANY_NAME = 'Tour De India Holidays';
process.env.APP_URL = 'https://crm.tourdeindia.test';

/** Every message the application tried to send. */
const outbox: { to: string; subject: string; html: string }[] = [];
let smtpConfigured = true;
let smtpFails = false;

function createSmtpFake() {
  return {
    get isConfigured() {
      return Promise.resolve(smtpConfigured);
    },
    send: (email: { to: string; subject: string; html: string }) => {
      if (smtpFails) return Promise.reject(new Error('550 mailbox unavailable'));
      outbox.push(email);
      return Promise.resolve();
    },
    sendTest: (to: string) => {
      if (smtpFails) return Promise.reject(new Error('535 authentication failed'));
      outbox.push({ to, subject: 'SMTP test', html: '<p>ok</p>' });
      return Promise.resolve();
    },
    getStatus: () =>
      Promise.resolve({
        configured: smtpConfigured,
        host: 'smtp.test',
        port: 587,
        username: 'crm@tourdeindia.test',
        security: 'STARTTLS' as const,
        fromEmail: 'crm@tourdeindia.test',
        fromName: 'Tour De India Holidays',
        active: true,
        passwordReadable: true,
      }),
    save: () => Promise.reject(new Error('not used in this test')),
  };
}

const PROPOSAL_BODY = {
  title: 'Dubai Family Holiday',
  destination: 'Dubai',
  validUntil: '2027-06-30',
  currency: 'INR',
  sellingPrice: '150000',
  actualCost: '120000',
};

const DAY = 86_400_000;

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');
  const { SmtpService } = await import('../src/notifications/smtp.service');
  const { FollowUpScheduler } = await import('../src/follow-ups/follow-up.scheduler');
  const { encryptSecret, decryptSecret } = await import('../src/notifications/secret.cipher');
  const { NotificationService } = await import('../src/notifications/notification.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder
      .overrideProvider(StorageService)
      .useValue({
        put: () => Promise.resolve(),
        presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}`),
      })
      .overrideProvider(SmtpService)
      .useValue(createSmtpFake()),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];
  const scheduler = app.get(FollowUpScheduler);

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

  // --- the encryption used for the SMTP password ---------------------------
  const cipher = encryptSecret('hunter2', 'a-server-secret');
  assert.ok(!cipher.includes('hunter2'), 'the password is not stored in the clear');
  assert.equal(decryptSecret(cipher, 'a-server-secret'), 'hunter2');
  assert.equal(
    decryptSecret(cipher, 'a-different-secret'),
    null,
    'a rotated key fails cleanly rather than returning rubbish',
  );
  assert.equal(decryptSecret('not-a-cipher-text', 'a-server-secret'), null);
  assert.notEqual(
    encryptSecret('hunter2', 'a-server-secret'),
    cipher,
    'the same password encrypts differently each time',
  );

  // --- a submitted proposal, which is what starts everything ---------------
  const lead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', employee)
    .send({ customerName: 'Priya Nair', phone: '+91 98765 43210', destination: 'Dubai' })
    .expect(201);
  const leadId: string = lead.body.id;

  const proposal = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', employee)
    .send(PROPOSAL_BODY)
    .expect(201);
  const proposalId: string = proposal.body.id;

  // Nothing is scheduled until the proposal actually goes out.
  assert.equal(prisma.followUps.length, 0, 'a draft proposal schedules nothing');

  await request(http)
    .post(`${base}/proposals/${proposalId}/generate`)
    .set('Cookie', employee)
    .expect(200);
  await request(http)
    .post(`${base}/proposals/${proposalId}/submit`)
    .set('Cookie', employee)
    .expect(200);

  // --- the schedule ---------------------------------------------------------
  assert.equal(prisma.followUps.length, 4, 'the default rule schedules four follow-ups');
  assert.deepEqual(
    prisma.followUps.map((item) => item.sequence),
    [1, 2, 3, 4],
  );

  const submittedAt = prisma.proposals[0]!.submittedAt!;
  const offsets = prisma.followUps.map((item) =>
    Math.round((item.dueAt.getTime() - startOfDay(submittedAt).getTime()) / DAY),
  );
  assert.deepEqual(offsets, [1, 3, 5, 7], 'day 1, 3, 5 and 7 after submission');
  assert.ok(
    prisma.followUps.every((item) => item.dueAt.getUTCHours() === 9),
    'follow-ups fall at the start of a working day, not at whatever minute the proposal went',
  );
  assert.ok(
    prisma.followUps.every((item) => item.assignedToId === employeeId),
    'the consultant who owns the lead owes the calls',
  );

  // The lead's own next-follow-up date is kept in step, so the overdue filter
  // on the lead list stays truthful.
  const afterSubmit = await request(http)
    .get(`${base}/leads/${leadId}`)
    .set('Cookie', employee)
    .expect(200);
  assert.ok(afterSubmit.body.nextFollowUpAt, 'the lead knows when it is next due');

  // Re-submitting must not double-book the week.
  await request(http)
    .post(`${base}/proposals/${proposalId}/submit`)
    .set('Cookie', employee)
    .expect(400);
  assert.equal(prisma.followUps.length, 4, 'the schedule is not duplicated');

  // --- listing --------------------------------------------------------------
  await request(http).get(`${base}/follow-ups`).expect(401);

  const mine = await request(http).get(`${base}/follow-ups`).set('Cookie', employee).expect(200);
  assert.equal(mine.body.length, 4);
  assert.equal(mine.body[0].sequence, 1, 'soonest first');
  assert.equal(mine.body[0].proposalValue, 150_000, 'the customer-facing figure is shown');
  assert.ok(
    !JSON.stringify(mine.body).includes('120000'),
    'a follow-up list must not become a way to read cost',
  );
  assert.ok(!JSON.stringify(mine.body).includes('marginPercent'));

  // --- the sweep: PENDING → DUE ---------------------------------------------
  outbox.length = 0;
  const dayOne = new Date(prisma.followUps[0]!.dueAt.getTime() + 60_000);

  const first = await scheduler.sweep(dayOne);
  assert.equal(first.becameDue, 1, 'only the follow-up that has come due');
  assert.equal(first.notificationsSent, 1);
  assert.equal(outbox.length, 1);
  assert.match(outbox[0]!.subject, /Follow-up due/);
  assert.match(outbox[0]!.html, /Priya Nair/);
  assert.match(outbox[0]!.html, /INR 1,50,000/, 'the email quotes the customer-facing figure');
  assert.ok(!outbox[0]!.html.includes('1,20,000'), 'and never the cost');
  assert.match(outbox[0]!.html, /https:\/\/crm\.tourdeindia\.test\/leads\//);

  // Running it again changes nothing. This is the property that matters most:
  // a scheduler that is not idempotent spams people until they ignore it.
  const repeat = await scheduler.sweep(dayOne);
  assert.equal(repeat.becameDue, 0);
  assert.equal(repeat.notificationsSent, 0);
  assert.equal(outbox.length, 1, 'the same follow-up is never announced twice');

  // --- the sweep: DUE → MISSED ----------------------------------------------
  // 24 hours of grace by default, so an afternoon call is not a missed one.
  const sameEvening = new Date(dayOne.getTime() + 8 * 3_600_000);
  const stillDue = await scheduler.sweep(sameEvening);
  assert.equal(stillDue.becameMissed, 0, 'a follow-up done later the same day is not missed');

  const twoDaysLater = new Date(dayOne.getTime() + 2 * DAY);
  const missed = await scheduler.sweep(twoDaysLater);
  assert.equal(missed.becameMissed, 1);
  assert.equal(prisma.followUps[0]!.status, 'MISSED');

  const missedEmail = outbox.find((mail) => /Missed follow-up/.test(mail.subject));
  assert.ok(missedEmail, 'the assigned consultant is told');
  assert.equal(missedEmail.to, EMPLOYEE_EMAIL);
  assert.match(missedEmail.html, /Days overdue/);
  assert.ok(!missedEmail.html.includes('1,20,000'));

  // One notification per missed follow-up, however many times we sweep.
  const before = outbox.filter((mail) => /Missed follow-up/.test(mail.subject)).length;
  await scheduler.sweep(new Date(twoDaysLater.getTime() + 60_000));
  await scheduler.sweep(new Date(twoDaysLater.getTime() + 120_000));
  const after = outbox.filter((mail) => /Missed follow-up/.test(mail.subject)).length;
  assert.equal(after, before, 'a missed follow-up is reported exactly once');

  assert.equal(
    prisma.notifications.filter((row) => row.type === 'FOLLOW_UP_MISSED').length,
    1,
    'and only one notification was ever recorded',
  );

  // It reaches the lead timeline too, so the history is complete.
  const timeline = (
    await request(http)
      .get(`${base}/leads/${leadId}/activities`)
      .set('Cookie', employee)
      .expect(200)
  ).body as { type: string }[];
  assert.ok(timeline.some((entry) => entry.type === 'FOLLOW_UP_MISSED'));
  assert.ok(timeline.some((entry) => entry.type === 'FOLLOW_UP_SCHEDULED'));

  // --- recording what happened ----------------------------------------------
  const open = (
    await request(http)
      .get(`${base}/follow-ups`)
      .query({ status: 'DUE' })
      .set('Cookie', employee)
      .expect(200)
  ).body as { id: string }[];

  // Sweep the second one into DUE so there is something to complete.
  const daySeven = new Date(prisma.followUps[3]!.dueAt.getTime() + 60_000);
  await scheduler.sweep(daySeven);

  const due = (
    await request(http)
      .get(`${base}/follow-ups`)
      .query({ status: 'DUE' })
      .set('Cookie', employee)
      .expect(200)
  ).body as { id: string; sequence: number }[];
  assert.ok(due.length > 0, `something is due (was ${open.length})`);

  const target = due[0]!;

  const noComment = await request(http)
    .post(`${base}/follow-ups/${target.id}/complete`)
    .set('Cookie', employee)
    .send({ contactMethod: 'PHONE', outcome: 'INTERESTED' })
    .expect(400);
  assert.ok(noComment.body.details.comment?.length, '"done" is not a record of anything');

  const completed = await request(http)
    .post(`${base}/follow-ups/${target.id}/complete`)
    .set('Cookie', employee)
    .send({
      comment: 'Called. Wants a 5-star option and will decide by Friday.',
      contactMethod: 'PHONE',
      outcome: 'NEEDS_TIME',
      nextAction: 'Send a 5-star alternative',
    })
    .expect(200);

  assert.equal(completed.body.status, 'COMPLETED');
  assert.equal(completed.body.outcome, 'NEEDS_TIME');
  assert.equal(completed.body.completedBy.id, employeeId);

  await request(http)
    .post(`${base}/follow-ups/${target.id}/complete`)
    .set('Cookie', employee)
    .send({ comment: 'Called again', contactMethod: 'PHONE', outcome: 'INTERESTED' })
    .expect(400);

  const completedTimeline = (
    await request(http)
      .get(`${base}/leads/${leadId}/activities`)
      .set('Cookie', employee)
      .expect(200)
  ).body as { type: string; summary: string; detail: string | null }[];
  const entry = completedTimeline.find((item) => item.type === 'FOLLOW_UP_COMPLETED');
  assert.ok(entry);
  assert.match(entry.summary, /Needs time via phone/);
  assert.match(entry.detail ?? '', /5-star option/);

  // --- an outcome that closes the schedule ----------------------------------
  const remaining = (
    await request(http)
      .get(`${base}/follow-ups`)
      .query({ status: 'PENDING' })
      .set('Cookie', employee)
      .expect(200)
  ).body as { id: string }[];

  if (remaining.length > 0) {
    await request(http)
      .post(`${base}/follow-ups/${remaining[0]!.id}/complete`)
      .set('Cookie', employee)
      .send({
        comment: 'Customer confirmed and is ready to pay.',
        contactMethod: 'WHATSAPP',
        outcome: 'READY_TO_BOOK',
      })
      .expect(200);

    assert.equal(
      prisma.followUps.filter((item) => item.status === 'PENDING' || item.status === 'DUE').length,
      0,
      'a customer ready to book is not chased any further',
    );
  }

  // --- who can see what -----------------------------------------------------
  const adminSees = await request(http).get(`${base}/follow-ups`).set('Cookie', admin).expect(200);
  assert.equal(adminSees.body.length, 4, 'an admin sees the whole board');

  const otherLead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({ customerName: 'Someone Else', phone: '+91 90000 11111' })
    .expect(201);
  const otherProposal = await request(http)
    .post(`${base}/leads/${otherLead.body.id}/proposals`)
    .set('Cookie', admin)
    .send(PROPOSAL_BODY)
    .expect(201);
  await request(http)
    .post(`${base}/proposals/${otherProposal.body.id}/generate`)
    .set('Cookie', admin)
    .expect(200);
  await request(http)
    .post(`${base}/proposals/${otherProposal.body.id}/submit`)
    .set('Cookie', admin)
    .expect(200);

  const employeeStill = await request(http)
    .get(`${base}/follow-ups`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(employeeStill.body.length, 4, "an employee never sees a colleague's follow-ups");

  // --- rules are admin-only and validated -----------------------------------
  await request(http).get(`${base}/follow-ups/rules`).set('Cookie', employee).expect(403);

  const rules = await request(http)
    .get(`${base}/follow-ups/rules`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(rules.body.length, 1);
  assert.deepEqual(rules.body[0].offsetDays, [1, 3, 5, 7], 'the seeded default');
  assert.equal(rules.body[0].isDefault, true);

  const outOfOrder = await request(http)
    .post(`${base}/follow-ups/rules`)
    .set('Cookie', admin)
    .send({
      name: 'Muddled',
      offsetDays: [5, 1, 3],
      notifyAssignee: true,
      graceHours: 24,
      mandatory: false,
      isDefault: false,
      active: true,
    })
    .expect(400);
  assert.ok(outOfOrder.body.details.offsetDays?.length);

  const duplicated = await request(http)
    .post(`${base}/follow-ups/rules`)
    .set('Cookie', admin)
    .send({
      name: 'Twice on day 3',
      offsetDays: [3, 3],
      notifyAssignee: true,
      graceHours: 24,
      mandatory: false,
      isDefault: false,
      active: true,
    })
    .expect(400);
  assert.ok(duplicated.body.details.offsetDays?.length);

  const created = await request(http)
    .post(`${base}/follow-ups/rules`)
    .set('Cookie', admin)
    .send({
      name: 'Gentle',
      offsetDays: [2, 7, 14],
      notifyAssignee: true,
      graceHours: 48,
      mandatory: false,
      escalateAfterMissed: 2,
      isDefault: true,
      active: true,
    })
    .expect(201);
  assert.equal(created.body.isDefault, true);
  assert.equal(
    prisma.followUpRules.filter((rule) => rule.isDefault).length,
    1,
    'exactly one rule is ever the default',
  );

  // --- a failing mail server ------------------------------------------------
  // The notification is still recorded, with the reason — the situation was
  // noticed even though the email did not arrive.
  smtpFails = true;
  const beforeFailure = prisma.notifications.length;
  const laterStill = new Date(daySeven.getTime() + 5 * DAY);
  await scheduler.sweep(laterStill);
  smtpFails = false;

  const failed = prisma.notifications.filter((row) => row.status === 'FAILED');
  if (prisma.notifications.length > beforeFailure) {
    assert.ok(failed.length > 0, 'a delivery failure is recorded, not swallowed');
    assert.match(failed[0]!.error ?? '', /550|535/);
  }

  // --- the dedupe itself, exercised directly --------------------------------
  // The sweep is protected twice over: by the status transition and by the
  // unique dedupe key. That means the assertions above would still pass if the
  // dedupe were broken, so it is worth testing on its own — it is the half
  // that holds when two schedulers run at the same instant.
  const notifications = app.get(NotificationService);
  const recipient = { id: employeeId, email: EMPLOYEE_EMAIL, name: 'Rahul Sharma' };
  const email = { subject: 'Dedupe probe', body: '<p>probe</p>' };

  const outboxBefore = outbox.length;
  const firstSend = await notifications.send({
    type: 'FOLLOW_UP_DUE',
    recipient,
    dedupeKey: 'probe:one',
    email,
  });
  const secondSend = await notifications.send({
    type: 'FOLLOW_UP_DUE',
    recipient,
    dedupeKey: 'probe:one',
    email,
  });

  assert.equal(firstSend, true, 'the first send goes out');
  assert.equal(secondSend, false, 'the second is refused by the unique key');
  assert.equal(outbox.length, outboxBefore + 1, 'and no second email was sent');
  assert.equal(
    prisma.notifications.filter((row) => row.dedupeKey === 'probe:one').length,
    1,
    'one row, not two',
  );

  // A different key is a different event and does go out.
  assert.equal(
    await notifications.send({
      type: 'FOLLOW_UP_DUE',
      recipient,
      dedupeKey: 'probe:two',
      email,
    }),
    true,
  );

  // --- the admin's view of what went out ------------------------------------
  await request(http).get(`${base}/settings/notifications`).set('Cookie', employee).expect(403);

  const log = await request(http)
    .get(`${base}/settings/notifications`)
    .set('Cookie', admin)
    .expect(200);
  assert.ok(log.body.length > 0);
  assert.ok(
    !JSON.stringify(log.body).includes('<html'),
    'the notification log does not carry message bodies around',
  );

  // --- SMTP configuration is admin-only -------------------------------------
  await request(http).get(`${base}/settings/smtp`).set('Cookie', employee).expect(403);

  const smtp = await request(http).get(`${base}/settings/smtp`).set('Cookie', admin).expect(200);
  assert.equal(smtp.body.configured, true);
  assert.ok(!('password' in smtp.body), 'the response has no password field at all');

  const test = await request(http)
    .post(`${base}/settings/smtp/test`)
    .set('Cookie', admin)
    .send({ to: 'someone@example.com' })
    .expect(200);
  assert.match(test.body.message, /someone@example\.com/);

  await request(http)
    .post(`${base}/settings/smtp/test`)
    .set('Cookie', admin)
    .send({ to: 'not-an-email' })
    .expect(400);

  // --- raising one by hand --------------------------------------------------
  //
  // Schedules only ever chase proposals. Chasing an unanswered enquiry, or an
  // unpaid invoice, is the same job and had nowhere to be recorded.
  const onLead = await request(http)
    .post(`${base}/follow-ups`)
    .set('Cookie', admin)
    .send({ leadId, dueAt: '2026-09-01', reason: 'Call back after they speak to their family' })
    .expect(201);

  assert.equal(onLead.body.kind, 'LEAD');
  assert.equal(onLead.body.proposalId, null);
  assert.equal(onLead.body.sequence, 0, 'zero says nobody scheduled it');
  assert.equal(onLead.body.reason, 'Call back after they speak to their family');
  assert.equal(onLead.body.leadId, leadId);

  const onProposal = await request(http)
    .post(`${base}/follow-ups`)
    .set('Cookie', admin)
    .send({ proposalId, dueAt: '2026-09-02', reason: 'Chase the hotel change' })
    .expect(201);

  assert.equal(onProposal.body.kind, 'PROPOSAL');
  assert.equal(onProposal.body.proposalId, proposalId);
  assert.equal(onProposal.body.leadId, leadId, 'the lead is derived, never passed');

  // A follow-up has to be about something.
  await request(http)
    .post(`${base}/follow-ups`)
    .set('Cookie', admin)
    .send({ dueAt: '2026-09-03', reason: 'Nothing in particular' })
    .expect(400);

  // --- filtering by what is being chased ------------------------------------
  const leadKind = await request(http)
    .get(`${base}/follow-ups`)
    .query({ kind: 'LEAD' })
    .set('Cookie', admin)
    .expect(200);

  assert.ok((leadKind.body as { kind: string }[]).every((row) => row.kind === 'LEAD'));
  assert.equal((leadKind.body as unknown[]).length, 1);

  // --- searching by the customer's name -------------------------------------
  const byName = await request(http)
    .get(`${base}/follow-ups`)
    .query({ search: 'priya' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok((byName.body as unknown[]).length > 0, 'search is case-insensitive');

  const noMatch = await request(http)
    .get(`${base}/follow-ups`)
    .query({ search: 'nobody-by-that-name' })
    .set('Cookie', admin)
    .expect(200);
  assert.equal((noMatch.body as unknown[]).length, 0);

  await app.close();
  console.log('All follow-up smoke checks passed.');
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(9, 0, 0, 0);
  return result;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
