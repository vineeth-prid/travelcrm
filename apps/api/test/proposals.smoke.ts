/**
 * End-to-end smoke test of proposals: pricing, the profitability calculation,
 * version history, PDF generation and submission.
 *
 * The centre of it is the guarantee from §12 and §38 — that internal cost and
 * margin never reach a customer-facing document and never reach an employee
 * without permission. That is asserted against the real rendered PDF bytes,
 * not just the JSON, because the PDF is the thing that actually gets sent.
 *
 * Run with: npm run check -w @travel-crm/api
 */
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import request from 'supertest';

/**
 * The text inside a PDF, as one string.
 *
 * pdfkit Flate-compresses its content streams, so scanning the raw bytes finds
 * nothing; inflating them lets this assert against the document that is
 * actually shipped rather than an uncompressed one built for the test.
 *
 * Text is written either as a literal `(Dubai) Tj` or, once kerning is in
 * play, as hex `<44756261 69>` — which for the standard fonts holds the
 * character codes directly. Both are decoded here.
 *
 * This only reads back while the document uses a standard font. With an
 * embedded subset TTF the hex holds glyph ids, which need the font's cmap to
 * make sense of; `textIsReadable` below is how the caller knows which world it
 * is in. The guarantee that internal figures never reach the PDF does not rest
 * on this function — see the recorded render data for that.
 */
function pdfText(pdf: Buffer): string {
  const parts: string[] = [];
  let cursor = 0;

  for (;;) {
    const start = pdf.indexOf('stream', cursor);
    if (start === -1) break;
    const end = pdf.indexOf('endstream', start);
    if (end === -1) break;

    // Skip the EOL that must follow the `stream` keyword.
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
      // Not a Flate stream (an embedded image, say). Nothing to read here.
    }

    cursor = end + 'endstream'.length;
  }

  // Joined without separators: kerning splits a single word across several
  // runs, so anything else would break "150,000" in half.
  return parts.join('');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
process.env.JWT_SECRET = 'smoke-test-secret-that-is-long-enough';
process.env.LOG_LEVEL = 'error';
process.env.COMPANY_NAME = 'Tour De India Holidays';
process.env.COMPANY_CONTACT = 'hello@tourdeindia.test · +91 98765 43210';

/** Everything the API "uploaded". */
const stored = new Map<string, Buffer>();

function createStorageFake() {
  return {
    put: (key: string, body: Buffer) => {
      stored.set(key, body);
      return Promise.resolve();
    },
    presignedUrl: (key: string) => Promise.resolve(`https://files.test/${key}?signature=abc`),
  };
}

/** The exact case from the brief: ₹150,000 selling, ₹120,000 cost. */
const PROPOSAL_BODY = {
  title: 'Dubai Family Holiday — 5 Nights',
  destination: 'Dubai',
  travelStart: '2026-12-10',
  travelEnd: '2026-12-15',
  adults: '2',
  children: '2',
  executiveSummary:
    'Five nights in Dubai for a family of four, with transfers and a desert safari.',
  itinerary: 'Day 1 Arrival and transfer.\nDay 2 City tour.\nDay 3 Desert safari.',
  inclusions: '4-star hotel\nAirport transfers\nDesert safari',
  exclusions: 'Flights\nVisa fees\nPersonal expenses',
  hotelInfo: 'Rove Downtown or similar, 4 star.',
  transportInfo: 'Private airport transfers on arrival and departure.',
  activities: 'Desert safari with barbecue dinner.',
  terms: 'Prices are subject to availability at the time of booking.',
  validUntil: '2026-09-30',
  currency: 'INR',
  sellingPrice: '150000',
  actualCost: '120000',
};

const LEAD_BODY = {
  customerName: 'Priya Nair',
  phone: '+91 98765 43210',
  email: 'priya@example.com',
  destination: 'Dubai',
};

async function main(): Promise<void> {
  const { bootApp, sessionCookieFrom } = await import('./boot');
  const { ADMIN_PASSWORD, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD } = await import('./prisma-stub');
  const { StorageService } = await import('../src/storage/storage.service');
  const { ProposalPdfService } = await import('../src/proposals/proposal-pdf.service');

  const { app, prisma, base } = await bootApp((builder) =>
    builder.overrideProvider(StorageService).useValue(createStorageFake()),
  );

  const http = app.getHttpServer() as Parameters<typeof request>[0];

  /**
   * Everything ever handed to the renderer.
   *
   * This is the load-bearing check for §38, and it does not depend on being
   * able to read glyphs back out of a PDF: the renderer is given this object
   * and nothing else, so a field that is absent here cannot possibly be
   * printed, whatever the layout code does.
   */
  const rendered: Record<string, unknown>[] = [];
  const pdfService = app.get(ProposalPdfService);
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
  const employeeId = prisma.users[1]!.id;

  // A lead belonging to the employee, so both roles have something to look at.
  const lead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', employee)
    .send(LEAD_BODY)
    .expect(201);
  const leadId: string = lead.body.id;

  // --- authentication --------------------------------------------------------
  await request(http).get(`${base}/leads/${leadId}/proposals`).expect(401);
  await request(http).post(`${base}/leads/${leadId}/proposals`).send(PROPOSAL_BODY).expect(401);

  // --- validation ------------------------------------------------------------
  const noTitle = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, title: '' })
    .expect(400);
  assert.ok(noTitle.body.details.title?.length);

  const negativeCost = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, actualCost: '-1' })
    .expect(400);
  assert.ok(negativeCost.body.details.actualCost?.length, 'money cannot be negative');

  const backwards = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, travelStart: '2026-12-15', travelEnd: '2026-12-10' })
    .expect(400);
  assert.ok(backwards.body.details.travelEnd?.length);

  // --- create, and the profitability calculation -----------------------------
  const created = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send(PROPOSAL_BODY)
    .expect(201);

  const proposalId: string = created.body.id;
  assert.match(created.body.reference, /^TDH-P-\d{5}$/);
  assert.equal(created.body.status, 'DRAFT');
  assert.equal(created.body.versionCount, 1);
  assert.equal(created.body.currentVersion.version, 1);
  assert.equal(created.body.currentVersion.sellingPrice, 150_000);

  // §49, exactly.
  assert.equal(created.body.currentVersion.financials.actualCost, 120_000);
  assert.equal(created.body.currentVersion.financials.grossProfit, 30_000);
  assert.equal(created.body.currentVersion.financials.marginPercent, 20);

  // A client-supplied margin must never be trusted over the calculation.
  const tampered = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, grossProfit: 999_999, marginPercent: 99 })
    .expect(201);
  assert.equal(tampered.body.currentVersion.financials.grossProfit, 30_000);
  assert.equal(tampered.body.currentVersion.financials.marginPercent, 20);

  // A free trip has no margin, and must not produce Infinity or NaN.
  const free = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, sellingPrice: '0', actualCost: '0' })
    .expect(201);
  assert.equal(free.body.currentVersion.financials.marginPercent, 0);

  // A loss is allowed — a loss-leader is a real business decision — but it is
  // reported as the loss it is.
  const loss = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, sellingPrice: '100000', actualCost: '120000' })
    .expect(201);
  assert.equal(loss.body.currentVersion.financials.grossProfit, -20_000);
  assert.equal(loss.body.currentVersion.financials.marginPercent, -20);

  // --- who may see the money -------------------------------------------------
  // The employee owns this lead but has not been given the permission.
  assert.equal(prisma.users[1]!.canViewOwnProfitability, false);

  const asEmployee = await request(http)
    .get(`${base}/proposals/${proposalId}`)
    .set('Cookie', employee)
    .expect(200);

  assert.equal(
    asEmployee.body.proposal.currentVersion.financials,
    null,
    'an employee without permission sees no cost or margin',
  );
  assert.equal(
    asEmployee.body.proposal.currentVersion.sellingPrice,
    150_000,
    'the selling price is theirs to see — they have to quote it',
  );
  assert.ok(
    !JSON.stringify(asEmployee.body).includes('120000'),
    'the actual cost must not appear anywhere in the response',
  );

  // Granting the permission reveals it, for their own lead only.
  prisma.users[1]!.canViewOwnProfitability = true;
  const permitted = await request(http)
    .get(`${base}/proposals/${proposalId}`)
    .set('Cookie', employee)
    .expect(200);
  assert.equal(permitted.body.proposal.currentVersion.financials.actualCost, 120_000);
  assert.equal(permitted.body.proposal.currentVersion.financials.marginPercent, 20);

  // Somebody else's lead stays invisible entirely, permission or not.
  const otherLead = await request(http)
    .post(`${base}/leads`)
    .set('Cookie', admin)
    .send({
      ...LEAD_BODY,
      customerName: 'Someone Else',
      phone: '+91 90000 11111',
      email: 'someone@example.com',
    })
    .expect(201);
  const otherProposal = await request(http)
    .post(`${base}/leads/${otherLead.body.id}/proposals`)
    .set('Cookie', admin)
    .send(PROPOSAL_BODY)
    .expect(201);
  await request(http)
    .get(`${base}/proposals/${otherProposal.body.id}`)
    .set('Cookie', employee)
    .expect(404);

  prisma.users[1]!.canViewOwnProfitability = false;

  // --- the PDF ---------------------------------------------------------------
  await request(http)
    .post(`${base}/proposals/${proposalId}/submit`)
    .set('Cookie', admin)
    .expect(400);

  const generated = await request(http)
    .post(`${base}/proposals/${proposalId}/generate`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(generated.body.proposal.status, 'GENERATED');
  assert.equal(generated.body.proposal.currentVersion.hasPdf, true);
  assert.match(generated.body.pdfUrl, /^https:\/\/files\.test\//);
  assert.equal(stored.size, 1);

  const [key, pdf] = [...stored.entries()][0]!;
  assert.equal(key, `proposals/${proposalId}/v1.pdf`);
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-', 'a real PDF was rendered');
  assert.ok(pdf.length > 2000, 'the PDF has content');

  // The headline guarantee. The renderer was handed exactly one object, and
  // that object has no way to describe internal money.
  assert.equal(rendered.length, 1, 'the PDF was rendered once');
  const data = rendered[0]!;
  for (const forbidden of [
    'actualCost',
    'grossProfit',
    'marginPercent',
    'financials',
    'internalNotes',
    'notes',
  ]) {
    assert.ok(
      !(forbidden in data),
      `CustomerProposalPdfData must not carry "${forbidden}" to the renderer`,
    );
  }
  assert.equal(data.sellingPrice, 150_000, 'the price the customer pays is what it does carry');
  assert.ok(
    !JSON.stringify(data).includes('120000'),
    'the actual cost must not reach the renderer by any name',
  );

  // And the same again against the finished document. This reads glyphs back,
  // which only works while the fallback font is in use — see pdfText.
  const text = pdfText(pdf);
  const textIsReadable = text.includes('Dubai');

  if (textIsReadable) {
    // Indian grouping: ₹150,000 is written "1,50,000", not "150,000".
    assert.ok(text.includes('INR 1,50,000'), 'the customer sees the package price');
    for (const secret of ['1,20,000', '120000', '30,000', '30000', '20%', '20.0%']) {
      assert.ok(
        !text.includes(secret),
        `the PDF must never contain the internal figure "${secret}"`,
      );
    }

    for (const expected of ['TDH-P-', 'Priya Nair', '5 Nights / 6 Days', 'Desert safari']) {
      assert.ok(text.includes(expected), `the PDF should show "${expected}"`);
    }
  } else {
    // Brand fonts are installed, so the text is subset glyph ids. The
    // structural check above is unaffected and remains the real guarantee.
    console.log('  (PDF text not decodable — embedded fonts in use; structural checks still ran)');
  }

  // Regenerating returns the stored document rather than rebuilding it.
  const before = stored.size;
  await request(http)
    .post(`${base}/proposals/${proposalId}/generate`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(stored.size, before, 'an existing PDF is never rebuilt');

  // --- editing a draft, and what that does to the PDF ------------------------
  const edited = await request(http)
    .patch(`${base}/proposals/${proposalId}`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, sellingPrice: '155000' })
    .expect(200);
  assert.equal(edited.body.currentVersion.sellingPrice, 155_000);
  assert.equal(edited.body.currentVersion.version, 1, 'editing a draft does not bump the version');
  assert.equal(
    edited.body.currentVersion.hasPdf,
    false,
    'an edit clears the PDF built from the old figures',
  );

  await request(http)
    .post(`${base}/proposals/${proposalId}/generate`)
    .set('Cookie', admin)
    .expect(200);

  // --- submission ------------------------------------------------------------
  const submitted = await request(http)
    .post(`${base}/proposals/${proposalId}/submit`)
    .set('Cookie', admin)
    .expect(200);

  assert.equal(submitted.body.status, 'SENT');
  assert.ok(submitted.body.submittedAt);
  assert.equal(submitted.body.submittedBy.name, 'Ada Lovelace');

  // The lead follows the proposal.
  const afterSubmit = await request(http)
    .get(`${base}/leads/${leadId}`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(afterSubmit.body.stage, 'PROPOSAL_SENT');

  // And it is on the timeline.
  const timeline = (
    await request(http).get(`${base}/leads/${leadId}/activities`).set('Cookie', admin).expect(200)
  ).body as { type: string; summary: string }[];
  assert.ok(timeline.some((entry) => entry.type === 'PROPOSAL_SENT'));
  assert.ok(timeline.some((entry) => entry.type === 'PROPOSAL_GENERATED'));
  assert.ok(
    !timeline.some((entry) => entry.summary.includes('120,000')),
    'the internal cost must not leak onto the lead timeline',
  );

  // --- history is not rewritten ---------------------------------------------
  const editSent = await request(http)
    .patch(`${base}/proposals/${proposalId}`)
    .set('Cookie', admin)
    .send(PROPOSAL_BODY)
    .expect(400);
  assert.match(editSent.body.message, /cannot be changed/i);

  const revised = await request(http)
    .post(`${base}/proposals/${proposalId}/versions`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, sellingPrice: '145000', actualCost: '120000' })
    .expect(201);

  assert.equal(revised.body.currentVersion.version, 2);
  assert.equal(revised.body.currentVersion.sellingPrice, 145_000);
  assert.equal(revised.body.currentVersion.financials.grossProfit, 25_000);
  assert.equal(revised.body.reference, created.body.reference, 'the number is stable');
  assert.equal(revised.body.status, 'DRAFT', 'new figures have not been sent to anybody');
  assert.equal(revised.body.versionCount, 2);

  const history = (
    await request(http).get(`${base}/proposals/${proposalId}`).set('Cookie', admin).expect(200)
  ).body;
  assert.deepEqual(
    history.versions.map((version: { version: number }) => version.version),
    [2, 1],
    'history is newest first',
  );
  assert.equal(
    history.versions[1].sellingPrice,
    155_000,
    'version 1 kept the price it was sent at',
  );
  assert.equal(history.versions[1].hasPdf, true, "version 1's PDF is still there");

  // A historical PDF stays downloadable.
  const v1 = await request(http)
    .get(`${base}/proposals/${proposalId}/versions/1/pdf`)
    .set('Cookie', admin)
    .expect(200);
  assert.match(v1.body.pdfUrl, /v1\.pdf/);

  await request(http)
    .get(`${base}/proposals/${proposalId}/versions/9/pdf`)
    .set('Cookie', admin)
    .expect(404);

  // --- the customer's response ----------------------------------------------
  await request(http)
    .post(`${base}/proposals/${proposalId}/generate`)
    .set('Cookie', admin)
    .expect(200);
  await request(http)
    .post(`${base}/proposals/${proposalId}/submit`)
    .set('Cookie', admin)
    .expect(200);

  const accepted = await request(http)
    .patch(`${base}/proposals/${proposalId}/status`)
    .set('Cookie', admin)
    .send({ status: 'ACCEPTED' })
    .expect(200);
  assert.equal(accepted.body.status, 'ACCEPTED');
  assert.ok(accepted.body.decidedAt);

  const won = await request(http).get(`${base}/leads/${leadId}`).set('Cookie', admin).expect(200);
  assert.equal(won.body.stage, 'WON', 'an accepted proposal wins the lead');

  // A won lead is not dragged backwards by later document activity.
  await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send(PROPOSAL_BODY)
    .expect(201);
  const stillWon = await request(http)
    .get(`${base}/leads/${leadId}`)
    .set('Cookie', admin)
    .expect(200);
  assert.equal(stillWon.body.stage, 'WON');

  // SENT is not a status anyone can simply assert — submitting is its own step.
  const badStatus = await request(http)
    .patch(`${base}/proposals/${proposalId}/status`)
    .set('Cookie', admin)
    .send({ status: 'SENT' })
    .expect(400);
  assert.ok(badStatus.body.details.status?.length);

  // --- expiry is derived, not stored ----------------------------------------
  const expiring = await request(http)
    .post(`${base}/leads/${leadId}/proposals`)
    .set('Cookie', admin)
    .send({ ...PROPOSAL_BODY, validUntil: '2020-01-01' })
    .expect(201);
  assert.equal(expiring.body.isExpired, true, 'validity in the past reads as expired immediately');
  assert.equal(created.body.isExpired, false);

  // --- missing proposal ------------------------------------------------------
  await request(http)
    .get(`${base}/proposals/11111111-2222-4333-8444-555555555555`)
    .set('Cookie', admin)
    .expect(404);

  // --- the customer is actually sent it -------------------------------------
  //
  // Submitting used to record the fact and send nothing. People press Submit
  // and expect the customer to receive the proposal, so it does both now.
  {
    const sent = prisma.notifications.filter((row) => row.type === 'PROPOSAL_SENT');
    assert.ok(sent.length >= 1, 'submitting emails the proposal to the customer');

    for (const email of sent) {
      assert.equal(email.recipientEmail, 'priya@example.com', 'it goes to the customer');
      assert.match(email.subject, /proposal/i);
      assert.ok(
        !email.body.includes('120000') && !email.body.includes('1,20,000'),
        'and carries no cost or margin — this one leaves the building',
      );
    }
  }

  // --- the list across every lead -------------------------------------------
  const all = await request(http).get(`${base}/proposals`).set('Cookie', admin).expect(200);
  assert.ok((all.body as unknown[]).length >= 2, 'every proposal, not just one lead’s');
  assert.ok(
    (all.body as { reference: string }[]).some((row) => row.reference === created.body.reference),
  );

  const drafts = await request(http)
    .get(`${base}/proposals`)
    .query({ status: 'DRAFT' })
    .set('Cookie', admin)
    .expect(200);
  assert.ok(
    (drafts.body as { status: string }[]).every((row) => row.status === 'DRAFT'),
    'the status filter filters',
  );

  const searched = await request(http)
    .get(`${base}/proposals`)
    .query({ search: created.body.reference })
    .set('Cookie', admin)
    .expect(200);
  assert.equal((searched.body as unknown[]).length, 1, 'searching by reference finds exactly it');

  // The list obeys the same financial rule as everything else: an employee
  // without permission gets no margin, on any row.
  const employeeList = await request(http)
    .get(`${base}/proposals`)
    .set('Cookie', employee)
    .expect(200);
  assert.ok(
    (employeeList.body as { currentVersion: { financials: unknown } }[]).every(
      (row) => row.currentVersion.financials === null,
    ),
    'an employee without permission sees no cost or margin in the list',
  );

  await app.close();
  console.log('All proposal smoke checks passed.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
