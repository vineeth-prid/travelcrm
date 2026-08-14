# Travel CRM

Operations workspace for a travel business.

- **Phase 1 — Foundation & Application Shell**: authentication, the application shell,
  the design system, and the backend platform.
- **Phase 2 — Communication Engine**: a unified inbox for Instagram DMs, Instagram
  Lead Ads and WhatsApp, with live updates and manual replies.
- **Phase 3 — CRM**: travel details and a lead status captured on the conversation
  itself, beside the thread.
- **Phase 4 — AI Assistant**: on-demand summaries, travel-detail extraction and
  draft replies, all reviewed by the salesperson before anything happens.
- **Phase 5 — Quote Generation**: versioned quotations, PDF rendering, storage in
  MinIO, and delivery through the same channel the conversation is already on.
- **Phase 6 — Leads & Proposals**: the pipeline proper — leads with duplicate
  detection and a stage machine, versioned proposals with internal cost and margin,
  and a customer PDF that carries neither.
- **Phase 7 — Money & Follow-ups**: invoices, payments and payment status derived
  rather than stored; company expenses; rule-driven follow-ups with email; the
  admin dashboard and per-consultant performance.
- **Phase 8 — Administration & Assurance**: staff accounts and roles, an audit
  trail that records refusals as well as successes, CSV export, and a security
  sweep run against the API rather than the interface.

Booking and channel automation do not exist — by design. The sidebar says
**Coming Soon** rather than showing a screen that does nothing.

Two things are still needed before real use: the seven Phase 6–8 migrations have
never been applied to a live database (`npm run db:deploy`), and `AI_MODEL` must
name a model your Ollama has actually pulled — there is no default, on purpose.

---

## Stack

| Layer          | Choice                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Web            | Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query, React Hook Form, Zustand, Framer Motion |
| API            | NestJS 11, Prisma 6, PostgreSQL 16, JWT (httpOnly cookie), Zod, Swagger                                    |
| Monorepo       | npm workspaces                                                                                             |
| Infrastructure | Docker Compose (PostgreSQL, Redis, MinIO), GitHub Actions                                                  |

MinIO stores generated quote, proposal and invoice PDFs and expense receipts. AI runs
on a **local Ollama** — no cloud AI service is called from anywhere in this codebase.
Redis is started but **not used yet**; it is in place for queues, caching and inbox
fan-out across more than one API instance.

---

## Layout

```
apps/
  api/          NestJS API
                  auth, users, settings, health, shared      (Phase 1)
                  communication, integrations, webhooks      (Phase 2 + 3)
                  ai                                         (Phase 4)
                  quotes, storage                            (Phase 5)
                  leads, proposals                           (Phase 6)
                  invoices, expenses, follow-ups,
                  notifications, reports                     (Phase 7)
                  audit, exports                             (Phase 8)
  web/          Next.js application
packages/
  sdk/          Typed API client + the request/response contract (shared by both apps)
  ui/           Design system (shipped as TypeScript source, compiled with the web app)
```

`packages/sdk` is the single source of truth for the wire contract: response types
live in `types.ts`, and the Zod request schemas in `schemas.ts` are used by the API
to validate and by the web forms to give instant feedback. Neither side redeclares them.

---

## Getting started

### With Docker (recommended)

```bash
cp .env.example .env
docker compose up --build
```

That starts PostgreSQL, Redis, MinIO, the API and the web app. On boot the API
applies migrations and seeds the single administrator account.

| Service       | URL                          |
| ------------- | ---------------------------- |
| Web           | http://localhost:3000        |
| API           | http://localhost:3001/api/v1 |
| Swagger       | http://localhost:3001/docs   |
| MinIO console | http://localhost:9001        |

### Without Docker

You need a PostgreSQL 16 instance reachable at `DATABASE_URL`.

```bash
cp .env.example .env      # then point DATABASE_URL at your database
npm install               # builds packages/sdk and generates the Prisma client
npm run db:migrate        # apply migrations
npm run db:seed           # create the administrator account
npm run dev               # api on :3001, web on :3000
```

### Signing in

The seed creates one administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(`admin@travelcrm.test` / `ChangeMe123!` by default). Change the password from
**Settings → Change password** after the first sign-in. Re-running the seed never
overwrites an existing password.

---

## Scripts

| Command                            | What it does                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `npm run dev`                      | API and web in watch mode                             |
| `npm run build`                    | Build sdk → api → web                                 |
| `npm run lint`                     | ESLint across every workspace (zero warnings allowed) |
| `npm run typecheck`                | `tsc --noEmit` across every workspace                 |
| `npm run format`                   | Prettier write                                        |
| `npm run check -w @travel-crm/api` | Unit + HTTP smoke checks for the API                  |
| `npm run db:migrate`               | Create/apply a migration                              |
| `npm run db:deploy`                | Apply existing migrations (CI / production)           |
| `npm run db:seed`                  | Seed the administrator account                        |
| `npm run db:studio`                | Prisma Studio                                         |

---

## API

Base URL `http://localhost:3001/api/v1` — versioned via URI (`/api/v{n}`), documented
at `/docs`.

| Method | Path                 | Auth | Purpose                                   |
| ------ | -------------------- | ---- | ----------------------------------------- |
| POST   | `/login`             | —    | Sign in; sets the httpOnly session cookie |
| POST   | `/logout`            | —    | Clears the session cookie (idempotent)    |
| GET    | `/me`                | ✅   | The signed-in user                        |
| PATCH  | `/me`                | ✅   | Update name / email                       |
| POST   | `/me/password`       | ✅   | Change password                           |
| GET    | `/health`            | —    | API + database status                     |
| GET    | `/settings/app-info` | —    | Version, build, environment               |

### Communication (Phase 2)

| Method | Path                          | Auth | Purpose                                            |
| ------ | ----------------------------- | ---- | -------------------------------------------------- |
| GET    | `/conversations`              | ✅   | List; `?search=` name, phone, email or destination |
| GET    | `/conversations/events`       | ✅   | Server-Sent Events stream of inbox updates         |
| GET    | `/conversations/:id`          | ✅   | Open a conversation (clears its unread count)      |
| PATCH  | `/conversations/:id`          | ✅   | Save the lead details; returns the conversation    |
| GET    | `/conversations/:id/messages` | ✅   | Full history, oldest first                         |
| POST   | `/conversations/:id/messages` | ✅   | Send a text reply on that channel                  |
| GET    | `/webhooks/instagram`         | —    | Subscription handshake                             |
| POST   | `/webhooks/instagram`         | 🔐   | DMs and Lead Ads                                   |
| GET    | `/webhooks/whatsapp`          | —    | Subscription handshake                             |
| POST   | `/webhooks/whatsapp`          | 🔐   | Messages and delivery receipts                     |

🔐 = authenticated by Meta's `X-Hub-Signature-256` rather than a session cookie.

### AI assistant (Phase 4)

| Method | Path          | Auth | Purpose                                              |
| ------ | ------------- | ---- | ---------------------------------------------------- |
| POST   | `/ai/summary` | ✅   | Plain-text summary of a conversation                 |
| POST   | `/ai/extract` | ✅   | Travel details as JSON, `null` for anything unstated |
| POST   | `/ai/reply`   | ✅   | A draft reply for the composer                       |

Each takes `{ "conversationId": "…" }`. The transcript and CRM fields are assembled
server-side — the browser never sends conversation content to an AI endpoint.

### Quotes (Phase 5)

| Method | Path                        | Auth | Purpose                                    |
| ------ | --------------------------- | ---- | ------------------------------------------ |
| GET    | `/conversations/:id/quotes` | ✅   | Version history, newest first              |
| POST   | `/conversations/:id/quotes` | ✅   | Create the next version                    |
| GET    | `/quotes/:id`               | ✅   | One quote, with a link to its PDF          |
| PATCH  | `/quotes/:id`               | ✅   | Update a draft (sent quotes are immutable) |
| POST   | `/quotes/:id/generate`      | ✅   | Render the PDF and store it                |
| POST   | `/quotes/:id/send`          | ✅   | Deliver it and freeze the quote            |

### Administration (Phase 8)

Every route here is administrators only, enforced by the API.

| Method | Path                     | Auth | Purpose                                        |
| ------ | ------------------------ | ---- | ---------------------------------------------- |
| GET    | `/users`                 | 🛡️   | Every account, active or not                   |
| POST   | `/users`                 | 🛡️   | Create a colleague's account                   |
| PATCH  | `/users/:id`             | 🛡️   | Name, email, role, active, margin access       |
| POST   | `/users/:id/password`    | 🛡️   | Set a password (never returned, never emailed) |
| GET    | `/audit`                 | 🛡️   | The audit trail, newest first                  |
| GET    | `/exports/leads.csv`     | 🛡️   | Leads as CSV, optional `from`/`to`             |
| GET    | `/exports/proposals.csv` | 🛡️   | Proposals **with cost and margin**             |
| GET    | `/exports/payments.csv`  | 🛡️   | The payment ledger                             |
| GET    | `/exports/expenses.csv`  | 🛡️   | Company expenses                               |

🛡️ = session cookie **and** the `ADMIN` role, re-read from the database per request.

### Authentication

- The JWT travels in an **httpOnly, SameSite=Lax** cookie (`travel_crm_session`);
  JavaScript never touches it. Set `COOKIE_SECURE=true` behind HTTPS.
- Passwords are hashed with bcrypt (cost 12).
- Login is rate limited to 5 attempts per minute per IP; everything else to
  `RATE_LIMIT_PER_MINUTE` (default 600, generous because an office is one IP).
- Unknown emails and wrong passwords return the same error, so the endpoint cannot
  be used to enumerate accounts.
- Next.js middleware gates routes on the presence of the cookie; the authenticated
  layout then proves the session against `GET /me` before rendering.

The seed creates the first administrator; every other account is made from
**Settings → Users & roles**. There is no public registration and no password-reset
email — an administrator sets a password and passes it on.

Two roles, `ADMIN` and `EMPLOYEE`. The role and the active flag are read from the
database on every request, never trusted from the token, so a demotion or a
deactivation takes effect on the next request rather than at the next sign-in.

### Errors

Every failure — validation, auth, unexpected — returns the same shape:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "BAD_REQUEST",
  "path": "/api/v1/login",
  "timestamp": "2026-07-29T10:00:00.000Z",
  "details": { "email": ["Enter a valid email address"] }
}
```

`details` maps field paths to messages, which the web forms attach to the matching
inputs automatically.

---

## Communication engine

```
customer ─▶ Instagram DM / Instagram Lead Ad / WhatsApp
              │
              ▼  signed webhook
         parse → upsert contact → upsert conversation → store message
              │
              ▼  Server-Sent Event
         unified inbox  ─── salesperson replies ───▶ Graph API ─▶ customer
```

### Channels

| Channel          | Inbound                          | Outbound       |
| ---------------- | -------------------------------- | -------------- |
| `WHATSAPP`       | Text messages, delivery receipts | Text replies   |
| `INSTAGRAM`      | Direct messages (text)           | Text replies   |
| `INSTAGRAM_LEAD` | Lead Ads form submissions        | — inbound only |

A lead ad is a form submission, not a thread: Meta gives you the answers but no
messaging endpoint to answer on. Lead conversations therefore appear in the same
inbox with their answers as the first message, and the composer is replaced by a
note pointing the salesperson at WhatsApp. Attempting to send returns `400`.

### Behaviour worth knowing

- **Ingestion is idempotent.** `Message.externalMessageId` is unique, so Meta's
  routine webhook redelivery cannot duplicate a message.
- **Text only.** Images, audio, video, files, stickers, reactions, locations and
  contacts are parsed out and dropped, as are echoes of our own replies.
- **Sends happen before storage.** A reply is stored only once the provider has
  accepted it, so the inbox never shows a message the customer will not receive.
  Failures surface as a toast and the text stays in the composer.
- **Unusable payloads are still acknowledged with `200`** — anything else puts Meta
  into a retry loop. Only a bad signature returns an error (`401`).
- **Provider failures are translated**, not leaked: an expired token becomes
  "The Instagram connection has expired…", a 429 becomes "…is rate limiting us…".

### Connecting the channels

1. Fill in the `META_*`, `INSTAGRAM_*` and `WHATSAPP_*` variables in `.env`.
2. Expose the API publicly (`ngrok http 3001` in development).
3. In the Meta app dashboard, point the webhooks at
   `https://<host>/api/v1/webhooks/instagram` and `…/webhooks/whatsapp`, using the
   verify token you set. Subscribe to `messages` and `messaging` for Instagram,
   `leadgen` for Lead Ads, and `messages` for WhatsApp.

`META_APP_SECRET` is required in production; without it the API refuses every
webhook. In development it may be left blank, and unverified webhooks are accepted
with a warning so you can replay payloads with `curl`.

### CRM

Every conversation **is** the lead — there is no separate lead, customer or deal
table, and no "create lead" step. A conversation carries `destination`,
`travelMonth`, `adults`, `children`, `budget`, `status` and `notes`; the contact
gained an `email`. `PATCH /conversations/:id` is the only way to change them, and
it accepts nothing else — `unreadCount`, `channel` and the message history are not
writable through it.

| Status       | Badge | Meaning                            |
| ------------ | ----- | ---------------------------------- |
| `NEW`        | grey  | Default for every new conversation |
| `QUALIFIED`  | blue  | Worth pursuing                     |
| `QUOTE_SENT` | amber | Awaiting a decision                |
| `WON`        | green | Booked                             |
| `LOST`       | red   | Closed without a booking           |

The panel sits beside the thread on wide screens and behind a drawer below `xl`,
so the salesperson never leaves the inbox. Saving is explicit — there is no
autosave — and confirms with "Changes saved".

`packages/sdk` holds one `updateConversationSchema` used by both sides, including
the normalisation the browser needs: a cleared field becomes `null` rather than
`""`, and numeric text becomes a number. Search now covers name, phone, email and
destination.

## AI assistant

Three buttons at the top of the lead panel. Nothing runs on its own, and nothing
the model produces takes effect until the salesperson acts on it.

| Action                     | Produces                                     | The salesperson then…                        |
| -------------------------- | -------------------------------------------- | -------------------------------------------- |
| **Summarize conversation** | A plain-text brief in the panel              | reads it; it is never stored                 |
| **Extract travel details** | Destination, month, adults, children, budget | reviews the filled form and presses **Save** |
| **Suggest reply**          | A draft in the message composer              | edits it and presses **Send**                |

- **The model never writes and never sends.** Extraction fills form fields and
  leaves the form dirty; a suggested reply lands in the composer as text. The
  smoke test asserts both: after an extraction the conversation row is still
  untouched, and after a suggested reply the message count has not moved.
- **Summaries are generated on demand** and deliberately not persisted.
- **Nulls, not guesses.** The extraction prompt is explicit that an unstated
  value must come back as `null`, and the parser enforces it: `"unknown"`,
  `"N/A"` and `""` all normalise to `null`, and out-of-range values are dropped
  while the valid ones survive.
- **Prompts live in `src/ai/prompts/`**, one file per action, never inlined in a
  service. Each receives only what it needs — the summary and extraction prompts
  get the transcript alone; only the reply prompt also sees the saved CRM fields,
  so the draft does not ask for details already on file.
- **The transcript is capped** at the last 40 messages, 800 characters each.
- **Credentials never leave the server.** Every call goes through `ChatClient`;
  controllers and React components never talk to the model directly.

A fourth action, **Improve with AI**, sits on the lead form rather than the
inbox: a consultant pastes rough notes ("family of 4, Dubai, 5 nights in
December, budget around 1.5 lakh") and gets back a professional requirement
summary plus structured fields to review. It is the only AI action that works
before a lead exists.

- **It fills blanks only.** Suggestions are applied to fields that are still
  empty; anything the consultant typed is left alone. Clearing a field and
  running it again is how you overrule it.
- **Money is off limits.** The prompt forbids inventing a price, cost, tax,
  discount or total, and the parser whitelists fields rather than spreading
  them — so a model that helpfully returns `packagePrice` has it dropped before
  it reaches a form field. The only figure that survives is `budget`, which is a
  number the _customer_ stated about themselves. Every price, margin and total
  in this application is computed by application code from figures a human
  typed.
- **Indian numbering is understood.** "1.5 lakh" parses to `150000`; stripping
  to digits alone would read it as `15` and still look plausible.

Failures are translated before they reach the browser — timeout, rate limit,
rejected key, missing model, unreachable, and unreadable output each get their
own message, and the provider's own wording is logged rather than returned. The
smoke test checks that a secret embedded in the provider error does not appear
in the response. An AI failure never blocks CRM work: the button reports the
problem in a toast and the form stays usable by hand.

### Connecting it

`ChatClient` speaks the OpenAI chat-completions protocol, which is what Ollama
serves on `/v1` — so the same client covers a local Ollama server or any
OpenAI-compatible gateway. Nothing is hardcoded:

| Variable        | Default                     | Notes                                      |
| --------------- | --------------------------- | ------------------------------------------ |
| `AI_BASE_URL`   | `http://localhost:11434/v1` | Ollama. In Compose, `host.docker.internal` |
| `AI_MODEL`      | _(empty)_                   | Setting this is what switches the AI on    |
| `AI_API_KEY`    | _(empty)_                   | Unused by Ollama; needed by gateways       |
| `AI_TIMEOUT_MS` | `60000`                     | Local models are slower than a hosted API  |

`AI_MODEL` has **no default on purpose**: a guessed name that the server does
not have fails at the worst moment with a confusing error. Until it is set the
assistant reports itself as not switched on and the rest of the app is
unaffected. To find out what to put there, open **Settings → AI assistant**,
which lists the models the server actually has installed (or run `ollama list`).

## Proposals

A proposal is a priced, branded, versioned offer against a CRM lead. It is a
different artefact from the inbox's quick quote below, which stays exactly as it
was — proposals never read or write the `quotes` tables.

```text
Proposal          TDH-P-00042, the lead, where it stands with the customer
  └── versions    the content and the money, one row per revision
```

**Versions are immutable.** Editing is only possible while a proposal is a
draft. Once it has gone out, a change creates version 2 and version 1 keeps its
figures and its PDF for good — because "what did we actually offer them in
March?" has to stay answerable. The current version is simply the
highest-numbered one, so there is no "active" flag to fall out of step.

**Two figures are entered; the rest is derived.**

```text
Gross profit  = selling price − actual cost
Margin        = gross profit ÷ selling price × 100
```

Neither derived value is stored. Storing them would create a second place the
truth could live, and the two would eventually disagree. A client that posts a
`grossProfit` is ignored. A proposal priced at zero reports 0%, not `Infinity`.

Reports use `weightedMarginPercent`, not the average of margins: one ₹10,000
trip at 50% and one ₹500,000 trip at 10% average to 30%, but the business kept
10.8%.

### Keeping internal money internal

Three independent mechanisms, because this is the one thing that must not leak:

1. **The API omits it.** `financials` is `null` in the response unless the
   viewer is an admin, or an employee with `canViewOwnProfitability` looking at
   their own lead. The numbers do not leave the server rather than being hidden
   in the interface.
2. **The PDF cannot describe it.** `CustomerProposalPdfData` has no
   `actualCost`, `grossProfit` or `marginPercent` field, and the service builds
   it one field at a time — never by spreading the database record. A column
   added later is absent by default instead of quietly published.
3. **The test proves both.** `proposals.smoke.ts` records exactly what the
   renderer was handed, and inflates the generated PDF's content streams to
   check the shipped document shows `INR 1,50,000` and contains no trace of the
   ₹120,000 cost, the ₹30,000 profit or the 20% margin.

### The PDF

Server-side pdfkit, A4, stored in MinIO at `proposals/{id}/v{n}.pdf` and never
rebuilt once it exists. Brand palette throughout, Sun Yellow reserved for the
price pill. Poppins and Inter are used **if** the four `.ttf` files are present
in `apps/api/assets/fonts`; without them it falls back to Helvetica, which is
off-brand but still produces a correct, sendable document rather than crashing.

## Dashboards

Two genuinely different pages rather than one with half of it blanked out.

**An administrator** gets the §41 layout: money at the top, pipeline in the
middle, people and spending at the bottom — the intent being that the top row
alone answers "how is the business doing" without scrolling. **A consultant**
gets their own numbers, the follow-ups they owe today and their recently active
leads. No company revenue, no company margin, no expenses; the API would refuse
those anyway.

### Two margin figures, both labelled

§25 asks for the population to be stated rather than implied, because the
margin on _everything offered_ and the margin on _what was actually won_
answer different questions. Both are reported, each carrying its own
`population` field.

Within each, the average and the weighted figure are both shown, because they
disagree in a way that matters:

```text
one trip at   ₹10,000 selling / ₹5,000 cost   → 50% margin
one trip at  ₹500,000 selling / ₹450,000 cost → 10% margin

average  = 30.0%      ← flattering, and wrong
weighted = 10.8%      ← what the business actually kept
```

That exact case is the fixture in `reports.smoke.ts`, which asserts the two
values differ — a test that would pass silently if someone ever "simplified"
one into the other.

**Conversion is over decided leads only** (won ÷ won + lost). Counting deals
still in play as failures would make every healthy pipeline look like a bad
one.

### What is withheld from whom

`/reports/dashboard` is administrators only — it is exactly the company-wide
financial data §12 keeps from employees. `/reports/performance` is open to
everyone, but an employee gets **one row, their own**, and its
`averageMarginPercent` is `null` unless they have `canViewOwnProfitability`.
The interface renders an em dash for null; it never receives a number to hide.

Single-currency, for the same reason as everywhere else — `otherCurrencies`
names anything excluded.

The funnel, the trend and the category bars are plain CSS. One series and a
dozen points does not justify a charting library.

## Expenses

Internal throughout, and **administrators only** — §12 is explicit that
employees do not get company-wide financial data, so the class-level guard on
the controller _is_ the access model. There is no per-row scoping to fall back
on, which is why the smoke test checks every route rather than just the list.

Categories live in a table rather than an enum, because §23 asks for
administrators to be able to add their own and an enum would need a migration
and a deployment for "Visa fees". The ten from the brief are seeded. Renaming
one keeps its `slug`, so "Marketing" becoming "Marketing & PR" does not orphan
a year of reporting, and the foreign key is `RESTRICT` — deleting a category
must not silently take the spending with it.

### The dashboard

Totals, spend by category (highest first), a monthly trend, and this month
against last. Everything is computed from the stored rows; nothing is
denormalised.

**Single-currency by design.** Adding rupees to dollars needs an exchange rate
on the date of each expense, which is a real problem this application does not
solve. The summary reports one currency — the one asked for, or whichever the
business used most in the period — and `otherCurrencies` names any it excluded,
so nothing disappears from view without saying so.

The trend is drawn with plain CSS bars. One series and a dozen points does not
justify a charting library.

### Receipts

Uploaded to MinIO through a `FileInterceptor`, held in memory rather than
written to a temp file. The MIME type is checked against a whitelist and the
size capped at 5MB: an endpoint that takes a browser file and puts it in object
storage is exactly the shape of thing that becomes a file host if left open.

The storage key is **derived from the expense id**, never from the uploaded
filename, and is never returned to a client — the download endpoint hands back
a time-limited link only after checking authorisation, so knowing an object key
is not a way around it.

Deleting an expense leaves its receipt in storage. Orphaned bytes are cheap; a
delete that also destroys the evidence is hard to undo.

## Invoices & payments

Raised from a lead, prefilled from the accepted proposal. Converting a lead to
a booking creates **no second customer record** — the customer was created with
the lead and is simply reused, so there is nothing to deduplicate (§35F).

### The arithmetic

Three figures are entered: the package amount, the discount, and the tax
_rate_. Everything else is computed by `invoiceTotals()` — the same function
the form runs as you type and the server runs on write, so what a consultant
sees while entering a discount is exactly what gets billed.

```text
net    = package − discount
tax    = round(net × rate)        ← after the discount, never before
total  = net + tax
```

A posted `totalAmount` or `taxAmount` is ignored. Three database CHECK
constraints back this up, so even a direct SQL edit cannot produce a bill that
does not add up.

**Tax is not assumed.** `taxRateBps` is nullable and defaults to nothing,
because GST does not apply to every travel service and a default rate would
silently overbill. Rates are stored in basis points (1800 = 18%), which keeps
every money column an integer — no floats anywhere near a total. When no tax
applies the PDF omits the tax line entirely rather than printing "Tax: 0",
which only invites a question with no good answer.

### Payment status is derived

```text
paid ≥ total            → PAID        (never overdue, whatever the date)
issued and past due     → OVERDUE
anything received       → PARTIALLY_PAID
otherwise               → UNPAID
```

Nothing is stored. A stored status goes stale the moment a due date passes,
and then the "overdue" list quietly lies. The cost is that filtering by
payment status happens in the service rather than in SQL, which is an honest
trade at this scale.

An invoice takes **no more than is outstanding** — an overpayment is nearly
always a typo, and the error says what the balance actually is. Payments need
an issued invoice, and an invoice with payments cannot be cancelled: that needs
a credit note, which does not exist yet, and quietly voiding a paid bill would
lose the receipt.

### The document

Server-side pdfkit, A4, stored at `invoices/{id}.pdf`. Deliberately plainer
than the proposal: a proposal is selling something and can look it, an invoice
needs to be read, checked and paid, so the total is the loudest thing on the
page. Already-received payments are listed on it, so the balance is never in
doubt. `CustomerInvoicePdfData` has no field that could carry a cost or a
margin, the same boundary the proposal uses.

Company details for the header, the tax id and the "how to pay" block come from
`COMPANY_*`; per-invoice defaults from `INVOICE_*`. All of it is editable on
each invoice.

## Follow-ups

Submitting a proposal schedules the chasing. The default is day 1, 3, 5 and 7
afterwards, and that lives in a `follow_up_rules` row rather than in code, so
it changes without a deployment — from **Follow-ups → Schedules**, which
administrators see below the list. Follow-ups fall due at 09:00 rather than at
whatever minute the proposal happened to go out.

```text
proposal submitted → 4 follow-ups PENDING
   hourly sweep    → PENDING → DUE       (+ email the assignee)
   + grace period  → DUE     → MISSED    (+ email the assignee, once)
   consultant acts → any     → COMPLETED (outcome recorded)
```

Only a person closes a follow-up. The scheduler never marks one done, because
it has no way to know whether the call happened — it only moves things forward
into states that mean "still owed".

**The grace period is deliberate.** A follow-up due at 09:00 that somebody
makes at 16:00 is a follow-up made. Marking it missed anyway is how a CRM
teaches people to ignore its emails. The default is 24 hours, configurable.

Outcomes that end the conversation — _ready to book_, _not interested_ — cancel
the rest of the schedule, as do an accepted or rejected proposal, and expiry.

### Idempotency

A scheduler that double-sends is worse than one that does not run, so this is
protected twice over:

1. **Status transitions.** Each pass only ever selects rows in the state
   _before_ the one it writes, so a second run in the same minute finds nothing
   left to do.
2. **A unique `dedupeKey`.** Every notification is recorded before it is
   dispatched, under a key derived from what it is _about_ — never from the
   time. Two schedulers racing produce one row; the second insert is refused by
   the database, not by application locking.

The smoke test proves both, and tests the dedupe on its own as well — with two
mechanisms in play, testing only the outcome would let a broken dedupe pass.

### Delivery

```text
follow-up engine → NotificationService → SmtpService → SMTP
```

Business logic never touches a mail transport. Adding SES, WhatsApp or an
in-app inbox later means adding a provider, not editing the follow-up engine.
Notifications are persisted whether or not they are delivered: a row with
`status = FAILED` and the reason is the evidence that the situation was
noticed, and **Settings → Email** lists them.

Bodies come from `src/notifications/templates/`, one function per message —
missed follow-up, follow-up due, lead assigned, escalation — so wording changes
without touching the engine.

### SMTP configuration

Configured in the application, under **Settings → Email**, not in the
environment. The password is encrypted at rest with AES-256-GCM and **is never
serialised**: `SmtpStatus` has no password field, so no response can leak it —
it is not masked, it simply is not there.

The encryption key is derived from `JWT_SECRET`, which keeps the number of
secrets an operator manages at one. The documented consequence: rotating
`JWT_SECRET` makes a stored SMTP password unreadable and it must be entered
again. Nothing else is lost, and the settings screen says so plainly rather
than failing at the next send.

## Quotes

Everything happens in the lead panel beside the conversation — there is no quotes
page and no new navigation entry.

```
draft ──edit──▶ draft ──generate──▶ draft + PDF ──send──▶ SENT (frozen)
                                                            │
                                                   conversation → QUOTE_SENT
```

- **A conversation owns a numbered series of quotes.** The highest version is the
  latest; there is no "is latest" flag to keep in sync.
- **Sent quotes are immutable.** `PATCH` on one returns 400. The panel's Edit
  button becomes "Edit as new version", which opens the form pre-filled and
  `POST`s a fresh version — so history is never rewritten.
- **Money is calculated server-side.** Line totals and the grand total are derived
  from quantity × unit price on every write; a total in the request body is
  ignored. Amounts are whole currency units — there are no minor units.
- **Editing a draft clears its PDF**, so a stale document can never be sent.
- **Historical PDFs are never rebuilt.** Generating on a sent quote returns the
  stored file untouched.
- **Sending is one action, in order**: deliver the PDF, persist the outgoing
  message, freeze the quote, then move the lead to `QUOTE_SENT` — unless it is
  already `WON` or `LOST`, which keeps its outcome.

### Delivery

Sending reuses the Phase 2 communication engine, including its provider
selection, so a quote appears in the thread like any other reply.

| Channel          | How the PDF is delivered                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| `WHATSAPP`       | A document message; WhatsApp fetches the presigned link itself             |
| `INSTAGRAM`      | The link as a text message — Instagram Direct has no document message type |
| `INSTAGRAM_LEAD` | Not delivered. Generating and downloading still work.                      |

Because WhatsApp fetches the file from Meta's servers, `MINIO_PUBLIC_URL` must be
publicly reachable in production. On a laptop it points at `localhost`, so
document delivery will fail there — generate, open and download all work.

### PDF and storage

`pdfkit` renders a fixed A4 layout: company header, customer block, quote title,
item table, total, notes, validity. No templates, no theming. Files are stored in
MinIO under `quotes/{conversationId}/{quoteId}-v{n}.pdf` and served through
24-hour presigned links.

`StorageService` holds two MinIO clients on purpose: uploads use the endpoint the
API can reach (`minio:9000` in Compose), while presigned links must be signed for
the host the browser and WhatsApp will actually fetch. A signature is bound to
its host, so one client cannot do both.

Company identity comes from configuration — `COMPANY_NAME`, `COMPANY_LOGO_PATH`,
`COMPANY_CONTACT` — and is shown read-only under **Settings → Company
information**. A missing or unreadable logo is skipped rather than failing the
render.

### Realtime

The inbox subscribes to `GET /conversations/events` with the browser's native
`EventSource`. Events carry the changed conversation or message, and the client
turns each one into a TanStack Query invalidation rather than trusting it as the
source of truth — so a dropped event self-heals on the next one.

Fan-out is in-process. A second API instance would not see the first one's events;
switch `InboxEventsService` to Redis pub/sub (already in Compose) before scaling out.

---

## Administration, audit & exports

Everything in this section lives under Settings and is **administrators only**,
enforced by `JwtAuthGuard + RolesGuard` on the controller — not by hiding buttons.
The panels are hidden for employees as a courtesy; the API refuses them either way,
and `test/security.smoke.ts` proves it route by route.

### Users & roles

`GET/POST /users`, `PATCH /users/:id`, `POST /users/:id/password`. Accounts are
**deactivated, never deleted** — a colleague who leaves still owns the leads they
worked, and deleting the row would take that history with them. `active: false`
fails authentication at sign-in and at every request, because the guard re-reads
the role and the active flag from the database rather than trusting the token.

An administrator cannot demote or deactivate **themselves**. That is refused by the
API, not just disabled in the form — otherwise one careless save could leave the
company with no administrator and no way to make one.

Setting a password is its own endpoint rather than a field on the edit form, so a
careless "save" on a profile can never silently change somebody's credentials. The
new password is shown once, to the administrator who typed it; nothing is emailed.

`canViewOwnProfitability` is per-employee and covers **their own proposals only**.
There is no setting anywhere that grants an employee company-wide financials.

### Audit trail

Written by `AuditRecorder` and read through `GET /audit`. Read-only in the strict
sense: there is no write, update or delete endpoint for it anywhere in the API.

Coverage comes from two places, and it needs both:

- `AuditInterceptor` records **successes**.
- `AllExceptionsFilter` records **refusals** — 401, 403, 429 and validation
  failures. This is not redundancy: Nest runs guards _before_ interceptors, so a
  request a guard rejects never reaches the interceptor at all. Recording only from
  the interceptor would have logged every successful action and no failed attempt,
  which is precisely backwards for an audit trail.

Entries carry who, what, which record, from which IP, and the HTTP status — so a
run of 403s from one account reads as clearly as a successful edit. Ordering is by
an autoincrement `seq`, not by timestamp, because two entries share a millisecond
more often than you would think.

### CSV export

`GET /exports/{leads,proposals,payments,expenses}.csv`, with an optional `from`/`to`
range. Administrators only: the proposal export carries cost and margin and the
payment export carries the whole ledger, so there is no employee-scoped version.
An employee who wants their own numbers has the performance report.

Two details that matter more than they look:

- **Formula injection.** A cell starting `=`, `+`, `-`, `@`, tab or carriage return
  is prefixed with `'`. Without it, a customer who names themselves
  `=HYPERLINK(...)` executes in the accountant's spreadsheet.
- **A UTF-8 BOM** is written, because Excel otherwise reads `₹` as mojibake.

Exports are a `GET`, but they are audited anyway — somebody taking the whole
customer list out of the building is exactly what an audit trail is for. The browser
navigates to the URL rather than fetching it, so the file lands in Downloads.

### Rate limiting

Global, `RATE_LIMIT_PER_MINUTE` (default 600), plus a tighter **5 per minute** on
`POST /login`. The global default is deliberately generous: the throttler counts per
IP, and a whole office behind one NAT is one IP.

### Hardening that is not about permissions

- **No user relation is ever loaded whole.** Every `createdBy` / `assignedTo` /
  `recordedBy` is selected through `userSummarySelect` (id, name, email, role,
  active), so a colleague's bcrypt hash is not fetched at all — not fetched and
  then stripped by a mapper, which is one careless spread away from a breach.
  `security.smoke.ts` fetches six lists and asserts the hash appears in none.
- **Security headers.** The web app sends `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, `nosniff`, a referrer policy and a `Permissions-Policy`;
  the API sends `nosniff` and `frame-ancestors` on every response, from middleware
  so the smoke tests exercise the real thing. A CRM with a "record payment" button
  should not be frameable, and the API serves PDFs and CSVs built from text a
  customer typed.
- **`/settings/app-info` requires a session.** Version, environment and Node build
  are free reconnaissance. `/health` stays open because Docker has to reach it.
- **Uploaded filenames never reach the object key.** The extension is stripped to
  letters and digits; the rest of the key is derived from the expense id.

---

## Design system (`packages/ui`)

Button · Input · Textarea · Select · Checkbox · Card · Badge · Avatar · Modal ·
Drawer · Table · Pagination · Empty State · Loading State · Skeleton · Toast ·
Header · Sidebar · Search Box · Page Container · Form Field · Dropdown Menu

Light mode only. The Tour De India Holidays palette — Teal `#00B48F`, Deep Slate
`#2F3B47`, Sun Yellow `#F5D94F`, Soft Aqua `#78C0C0`, Pale Sky `#B4D8E4`, Off White
`#FCFCFB` — defined as Tailwind theme tokens in `apps/web/src/app/globals.css`. The
token _names_ are the original theme's on purpose, so `packages/ui` needs no changes
and a re-skin happens in one file. Poppins carries headings, Inter carries everything
you read; nothing else is loaded. Framer Motion is used only for page, modal and
drawer transitions.

Components ship as TypeScript source and are compiled by the consuming app
(`transpilePackages`), so there is no build step to keep in sync.

---

## Testing & CI

`npm run check -w @travel-crm/api` runs fourteen files, no test framework required.
The smoke suites boot the **real** Nest application — guards, interceptors, pipes and
the exception filter all in place — against an in-memory Prisma stub, so what they
assert is what production does, not what a mock was told to say.

- `test/checks.ts` — pure logic: duration parsing, environment validation, the Zod
  pipe, and the AI extraction parser (fenced JSON, currency strings, "unknown"
  answers, out-of-range values, prose instead of JSON).
- `test/api.smoke.ts` — boots the real Nest application with an in-memory Prisma
  stub and exercises the auth surface over HTTP: validation errors, cookie flags,
  authentication, password change and the generated Swagger document.
- `test/communication.smoke.ts` — the full communication cycle against the real
  application with only the Meta HTTP calls stubbed: webhook handshakes, signature
  rejection, Instagram DM / Lead Ad / WhatsApp ingestion, deduplication, skipping
  attachments and echoes, search, unread clearing, replies on both channels,
  delivery receipts, the lead-ad reply refusal, and the CRM: saving lead details,
  field validation, clearing values, the PATCH allow-list, and search by email and
  destination.
- `test/ollama.check.ts` — the chat client in isolation: which base URL and model it
  reads from the environment, that it refuses to guess a model name, and how it
  reports an Ollama that is not running.
- `test/ai.smoke.ts` — the four AI endpoints with the chat client faked: what
  each prompt is given, JSON mode only where it belongs, that extraction writes
  nothing and a suggested reply sends nothing, and that every provider failure
  becomes a friendly message with no raw detail leaking through.
- `test/quotes.smoke.ts` — the quote lifecycle with storage and the providers
  faked: validation, versioning, server-side pricing (including a request that
  tries to dictate its own total), draft edits clearing a stale PDF, immutability
  after sending, historical PDFs never being rebuilt, delivery through the
  communication engine, the `QUOTE_SENT` transition and the `WON` exception, and
  the lead-ad refusal. The PDF is really rendered by pdfkit and asserted to be
  one, so a broken layout fails the build.
- `test/leads.smoke.ts` — the lead lifecycle: duplicate detection on a normalised
  phone number, the stage machine (including a `LOST` lead that must carry a
  reason), reassignment, the activity timeline's ordering, and what an employee can
  and cannot see.
- `test/proposals.smoke.ts` — versioning, server-controlled pricing, the status
  transitions, and the §38 boundary: the customer PDF is rendered for real and
  asserted — structurally, not by grepping bytes — never to have been handed a cost,
  a profit or a margin.
- `test/follow-ups.smoke.ts` — rule-driven scheduling, the idempotency of the cron
  sweep, and that deciding a proposal cancels the follow-ups it created.
- `test/invoices.smoke.ts` — the §49 arithmetic end to end: ₹150,000 against a
  ₹120,000 cost is ₹30,000 profit at 20%, and an invoice of ₹150,000 with payments
  of 50,000 and 25,000 is 75,000 paid, 75,000 outstanding, `PARTIALLY_PAID`.
- `test/expenses.smoke.ts` — categories, the range filters, receipt upload, and the
  administrators-only guard on every route.
- `test/reports.smoke.ts` — the dashboard and performance figures, both margin
  populations, and the `null` that an employee without `canViewOwnProfitability`
  receives where a number would otherwise be.
- `test/security.smoke.ts` — a table-driven sweep over every administrator-only and
  authenticated route, asserting 401 anonymous and 403 as an employee against the
  **API**, not the interface. Plus user management, the audit trail, CSV formula
  injection, and a brute-force loop that must end in a 429.

GitHub Actions runs format check → lint → typecheck → checks → migrations → build
against a PostgreSQL service container.

Husky + lint-staged format staged files on commit.

---

## The workspace

| Route                  | What it is                                            | Who        |
| ---------------------- | ----------------------------------------------------- | ---------- |
| `/dashboard`           | Company-wide sales, margin and expense figures        | Admin      |
| `/leads`, `/leads/:id` | The pipeline, and one lead with its whole history     | Everyone\* |
| `/follow-ups`          | What is due today, and the schedules behind it        | Everyone\* |
| `/inbox`               | Live conversations, with the CRM beside them          | Everyone   |
| `/proposals/:id`       | One proposal — reached from its lead, not from a list | Everyone\* |
| `/invoices`            | Invoices and the payments against them                | Everyone\* |
| `/expenses`            | Company expenses by category                          | Admin      |
| `/reports/performance` | Per-consultant figures                                | Everyone†  |
| `/settings`            | Profile, mail, users, exports, audit trail            | Everyone‡  |

\* Employees see their own and unassigned work; the API scopes it, not the page.
† An employee gets one row, their own. ‡ Employees get profile and password; the
administration panels are hidden, and refused by the API regardless.

The sidebar also carries **Coming Soon** entries — Customers, a proposals list,
Payments, the Instagram and WhatsApp channel pages, AI automation. They are
deliberately inert: a disabled link is honest about what exists, a page of
placeholder controls is not.

The Inbox is three columns on a wide screen:

```
conversations │ thread + composer │ customer · CRM · AI · quotes
```

The right column is the whole of the CRM and quoting experience: customer
details, the lead form, the three AI actions and the quote history. Creating a
quote opens a slide-over on top of it — full-screen on mobile — so a consultant
never navigates away from the conversation they are answering.

Below `xl` the right column moves behind a toggle in the conversation header,
and below `sm` the list and thread swap places. There is no CRM page and no
quotes page; those are not destinations.

## Redirects behind a reverse proxy

Next resolves a middleware `Location` header through `new URL()` and throws on a
relative value, so every redirect must be absolute — which means something has to
decide the host.

`NEXT_PUBLIC_APP_URL` decides it. Set it to the public origin (`https://app.example.com`)
in any proxied deployment and login redirects are built against that, fixed at
deploy time. Left blank — the local default — the request's own address is used
instead, and Next drops the origin on the way out because it matches.

The host is deliberately **not** derived from `X-Forwarded-Host`. That header is
client-settable and nginx forwards it unless explicitly overridden, so trusting it
turns the login redirect into an open redirect: `X-Forwarded-Host: evil.com` on any
protected path would return a `307` to a lookalike sign-in page. With a configured
origin, spoofing `X-Forwarded-Host` _or_ `Host` changes nothing.

The `?next=` parameter is sanitised separately, in `safeNextPath()`. Without it a
crafted `/login?next=https://evil.com` would bounce a user off-site immediately
after they had typed their password. Only same-origin absolute paths are followed.

Both are covered by `npm run check -w @travel-crm/web`, and the HTTP behaviour of
each mode was verified against a running production build.

## Building the API

`nest build` deletes `dist/` before compiling (`deleteOutDir`), and `tsc` trusts
its incremental cache without checking that the files it recorded are still on
disk. If the cache lives outside `dist/`, the two desynchronise: the second and
every later build exits 0 having emitted nothing, and the failure only surfaces
when the process manager reports `Script not found: dist/main.js`.

`tsBuildInfoFile` therefore points inside `dist/`, so deleting the output
deletes the cache with it. A `postbuild` step also asserts that `dist/main.js`
exists and is non-empty, so a build that produces nothing fails at the build
rather than at deploy time.

Nothing needs clearing between builds — `npm run build` is repeatable as-is.

## Architecture notes

- Feature-based modules on both sides; adding a module means adding a folder.
- The repository pattern isolates Prisma from the services.
- The SDK contract makes new endpoints type-safe in the web app the moment they exist.
- Redis is already running for queues and caching when they are needed.
- Every customer-facing action — a reply, a quote — goes out through one place,
  `ConversationsService`, so provider selection and message persistence are never
  reimplemented.
