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

No booking, reporting or automation functionality exists yet — by design.

---

## Stack

| Layer          | Choice                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Web            | Next.js 15 (App Router), React 19, Tailwind CSS 4, TanStack Query, React Hook Form, Zustand, Framer Motion |
| API            | NestJS 11, Prisma 6, PostgreSQL 16, JWT (httpOnly cookie), Zod, Swagger                                    |
| Monorepo       | npm workspaces                                                                                             |
| Infrastructure | Docker Compose (PostgreSQL, Redis, MinIO), GitHub Actions                                                  |

MinIO stores generated quote PDFs. Redis is started but **not used yet** — it is in
place for queues and caching later.

---

## Layout

```
apps/
  api/          NestJS API
                  auth, users, settings, health, shared      (Phase 1)
                  communication, integrations, webhooks      (Phase 2 + 3)
                  ai                                         (Phase 4)
                  quotes, storage                            (Phase 5)
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

### Authentication

- The JWT travels in an **httpOnly, SameSite=Lax** cookie (`travel_crm_session`);
  JavaScript never touches it. Set `COOKIE_SECURE=true` behind HTTPS.
- Passwords are hashed with bcrypt (cost 12).
- Login is rate limited to 5 attempts per minute per IP; everything else to 120.
- Unknown emails and wrong passwords return the same error, so the endpoint cannot
  be used to enumerate accounts.
- Next.js middleware gates routes on the presence of the cookie; the authenticated
  layout then proves the session against `GET /me` before rendering.

There is exactly one administrator account. Registration, roles and permissions are
deliberately absent.

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
- **The key never leaves the server.** Every call goes through `OpenAiClient`;
  controllers and React components never touch OpenAI.

Failures are translated before they reach the browser — timeout, rate limit,
rejected key, unreachable, and unreadable output each get their own message, and
the provider's own wording is logged rather than returned. The smoke test checks
that a secret embedded in the provider error does not appear in the response.

Model and endpoint are configuration (`OPENAI_MODEL`, `OPENAI_BASE_URL`); no model
name is hardcoded. Without `OPENAI_API_KEY` the assistant reports itself as not
connected and the rest of the app is unaffected.

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

## Design system (`packages/ui`)

Button · Input · Textarea · Select · Checkbox · Card · Badge · Avatar · Modal ·
Drawer · Table · Pagination · Empty State · Loading State · Skeleton · Toast ·
Header · Sidebar · Search Box · Page Container · Form Field · Dropdown Menu

Light mode only. Slate/white/blue palette with green/amber/red/blue status colours,
defined as Tailwind theme tokens in `apps/web/src/app/globals.css`. Framer Motion is
used only for page, modal and drawer transitions.

Components ship as TypeScript source and are compiled by the consuming app
(`transpilePackages`), so there is no build step to keep in sync.

---

## Testing & CI

`npm run check -w @travel-crm/api` runs five files, no test framework required:

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
- `test/ai.smoke.ts` — the three AI endpoints with the OpenAI client faked: what
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

GitHub Actions runs format check → lint → typecheck → checks → migrations → build
against a PostgreSQL service container.

Husky + lint-staged format staged files on commit.

---

## The workspace

Three routes, and only one of them is where the work happens.

| Route        | What it is                                        |
| ------------ | ------------------------------------------------- |
| `/dashboard` | A summary: service status, version, quick links   |
| `/inbox`     | The workspace — everything below lives here       |
| `/settings`  | Profile, password, company and system information |

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

## Architecture notes

- Feature-based modules on both sides; adding a module means adding a folder.
- The repository pattern isolates Prisma from the services.
- The SDK contract makes new endpoints type-safe in the web app the moment they exist.
- Redis is already running for queues and caching when they are needed.
- Every customer-facing action — a reply, a quote — goes out through one place,
  `ConversationsService`, so provider selection and message persistence are never
  reimplemented.
