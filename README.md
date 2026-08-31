# DIC Alumni Platform

Alumni networking, events, fundraising, careers and compliance for **Daffodil
International College**.

An Express + PostgreSQL API serving a vanilla-JavaScript single-page app.
**No build step, no bundler, no framework** — `index.html` loads plain
`<script>` tags and the server runs straight from source. That is a deliberate
constraint and it shapes almost every rule in this document.

| | |
|---|---|
| Runtime | Node ≥ 18 (developed on 26), Express 5, PostgreSQL 16 |
| API | 127 routes |
| Database | 39 tables |
| Frontend | ~7,000 lines across 22 ordered scripts, no bundler |
| Deployment | Vercel serverless (`api/index.js` → `server.js`) |
| Dependencies | 4 — `express`, `pg`, `cors`, `body-parser` |

---

## Table of contents

1. [Quick start](#1-quick-start)
2. [Configuration](#2-configuration)
3. [Database setup and migrations](#3-database-setup-and-migrations)
4. [Project structure](#4-project-structure)
5. [Architecture](#5-architecture)
6. [Authentication and RBAC](#6-authentication-and-rbac)
7. [API surface](#7-api-surface)
8. [Frontend architecture](#8-frontend-architecture)
9. [Rules that are easy to break](#9-rules-that-are-easy-to-break)
10. [Verification](#10-verification)
11. [Deployment](#11-deployment)
12. [Known issues](#12-known-issues)
13. [Working on this codebase](#13-working-on-this-codebase)

---

## 1. Quick start

You need Node ≥ 18 and a PostgreSQL database (local, or a cloud one such as
Neon — the project is developed against Neon).

```bash
git clone <repo-url>
cd "Alumnai system for Dic"
npm install

cp .env.example .env        # then fill it in — see §2
npm start                   # http://localhost:8000
```

Check it came up:

```bash
curl http://localhost:8000/api/health
# {"status":"online","database":"Cloud PostgreSQL (SSL Active)","is_cloud":true,…}
```

Then open <http://localhost:8000>. The seeded accounts ship **login-disabled**,
so provision a password for one of them before you can sign in (see §6).

**`npm run dev`** does the same with `node --watch`, restarting on file change.

> **Note for anyone who read the old README:** it said to run
> `python3 -m http.server 8000`. That serves static files only — the API never
> starts and every request fails. Use `npm start`.

---

## 2. Configuration

Configuration comes from the environment. A `.env` file at the repository root
is loaded automatically at startup by `src/server/config/env.js`. Real
environment variables always win over the file, so Vercel/CI settings are never
overridden by a stray local file.

Copy `.env.example` and fill it in:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (cloud) | Postgres connection string. `POSTGRES_URL` is accepted as an alias. |
| `SESSION_SECRET` | **yes in production** | HMAC key for session tokens. |
| `ENCRYPTION_KEY` | for the identity vault | 64 hex chars — AES-256-GCM key for NID/BRC fields. |
| `PORT` | no | Defaults to `8000`. |

Generate the two secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**If `SESSION_SECRET` is unset**, the server generates a random one at boot and
logs a warning. Every restart then invalidates all sessions — and on Vercel,
where each cold start is a fresh instance, users are logged out unpredictably
as requests land on different instances. Always set it in production.

**If `ENCRYPTION_KEY` is unset or malformed**, the identity-vault endpoints
refuse to store data rather than silently writing plaintext. That is
intentional; a warning is logged at boot.

For a local Postgres instead of a connection string, the discrete `PG*`
variables are supported: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, `PGSSL`. These are not in `.env.example`; see
`src/server/db/pool.js` for the defaults.

`.env` is gitignored. Do not commit it.

---

## 3. Database setup and migrations

The schema is split across three files in `db/`, applied in order.

| File | Contents |
|---|---|
| `db/schema.sql` | 20 tables — users, profiles, chapters, stories, jobs, events, campaigns, notifications, audit log, and the first event-planner tables |
| `db/schema_v2.sql` | 19 tables — donations, registrations, mentorships, connections, applications, referrals, vendors, timeline, logistics, marketing, meetings, broadcasts, polls, consent, identity vault, DSAR |
| `db/schema_v3.sql` | No new tables — adds columns (`occupation`, `hsc_group`, `hsc_version`, `photo_url`, `must_change_password`, `created_via`) and relaxes one `NOT NULL` |
| `db/seed.sql` | Five **login-disabled** reference accounts and sample rows — see §6 |

### Standing up a fresh database

```bash
# 1. schema.sql + seed.sql
curl -X POST http://localhost:8000/api/seed-db \
     -H "Authorization: Bearer <super_admin token>"

# 2. and 3. — run by hand, in this order
node scripts/migrate-v2.js
node scripts/migrate-v3.js
```

> **Read this before standing up a new environment.** There is **no migration
> tracking table**. `/api/seed-db` applies only `schema.sql` and `seed.sql`;
> the v2 and v3 files are applied *only* by running those two scripts manually.
> An environment created without them is missing 19 tables and 6 columns, and
> the failures show up later as confusing runtime errors rather than at setup.
>
> Both scripts are idempotent (`CREATE TABLE IF NOT EXISTS`,
> `ADD COLUMN IF NOT EXISTS`) so re-running them is safe.

### Other scripts in `scripts/`

| Script | What it does |
|---|---|
| `migrate-v2.js` | Applies `schema_v2.sql`, backfills campaign totals from the donations ledger, seeds planner sample rows only when empty |
| `migrate-v3.js` | Applies `schema_v3.sql`, then reads back column metadata to confirm |
| `migrate-alumni.js` | Upserts 12 hardcoded alumni. **Contains two `DELETE` statements** scoped to leftover `DIC-TEST-%` / `test_crud_%` rows. Narrow, but read it before running. |
| `seed-cloud.js` | Standalone schema+seed uploader that takes a connection string as `argv[2]`. Superseded by `/api/seed-db`; kept for reference. Has no target guard — pointing it at production is one command line away. |

All of them talk to whatever `DATABASE_URL` resolves to. There is no
confirmation prompt. Check your environment before running any of them.

---

## 4. Project structure

```
.
├── index.html              SPA shell — 14 page containers, 22 script tags
├── styles.css              all styling (4,467 lines, not yet split)
├── manifest.json           PWA manifest
├── server.js               Express composition root
├── vercel.json             deployment config
├── api/
│   └── index.js            Vercel entry — re-exports server.js
│
├── src/server/
│   ├── config/
│   │   ├── paths.js        every filesystem path, resolved once
│   │   ├── env.js          .env parsing
│   │   └── constants.js    role groups, session TTL, import password
│   ├── db/
│   │   └── pool.js         pg pool + schema/seed bootstrap
│   ├── middleware/
│   │   ├── auth.js         hashing, tokens, requireAuth, requireRole
│   │   └── static-assets.js  the static allow-list — see §9
│   ├── shared/
│   │   ├── http.js         ok() wrapper, publicUser() serialiser
│   │   ├── crypto.js       AES-256-GCM field encryption
│   │   ├── audit.js        hash-chained audit writer
│   │   └── reference.js    receipt/ticket code generator
│   └── modules/
│       ├── index.js        mounts the domain modules, in order
│       ├── events/         events, registration, tickets, check-in    (9)
│       ├── jobs/           jobs, applications, referrals              (7)
│       ├── giving/         campaigns, donations, leaderboard          (8)
│       ├── mentorship/     mentorships, suggestions                   (4)
│       ├── community/      connections, polls, broadcasts             (6)
│       ├── custom-fields/  admin-defined profile fields               (3)
│       ├── audit/          audit log reads                            (1)
│       ├── planner/        event planning workspace                  (11)
│       └── compliance/     consent, identity vault, DSAR             (11)
│
├── src/client/
│   ├── core/               api-client, state, helpers, auth,
│   │                       app-shell, ui-modals, runtime
│   └── features/           directory, events, planner, jobs, giving,
│                           profile, admin, compliance, bulk-import …
│
├── db/                     schema.sql, schema_v2.sql, schema_v3.sql, seed.sql
├── scripts/                migrations and seeding
├── tests/                  e2e-crud.js
├── tools/                  verification tooling — see §10
├── docs/                   code-organization.html, findings.md
└── assets/                 logos
```

Nothing under `src/server/`, `db/`, `scripts/`, `tests/` or `tools/` is served
over HTTP. See §9.

---

## 5. Architecture

### Request flow

```
Browser
  │  fetch() via src/client/core/api-client.js  (Bearer token attached)
  ▼
server.js
  ├─ cors → bodyParser.json → staticAssets (allow-list) → attachUser
  ├─ 33 routes declared directly (auth, alumni, chapters, stories,
  │  moderation, notifications, bulk import, planner-lite)
  ├─ src/server/modules/index.js  → 7 v2 domain modules
  ├─ planner module
  ├─ compliance module
  ├─ /api/* → JSON 404
  ├─ *.ext  → plain 404
  └─ *      → index.html (SPA shell)
       │
       ▼
   src/server/db/pool.js  →  PostgreSQL
```

### Layering, honestly described

```
route handler  →  db.query(...)  →  PostgreSQL
```

There is **no service or repository layer**. SQL is written inline inside route
handlers — 176 `db.query` calls across the backend. This is a known gap, not an
oversight, and it is the largest remaining piece of technical debt. Introducing
a repository layer touches every handler and is a far bigger change than the
file reorganization; it is item 10 in `docs/code-organization.html`.

When adding a route, follow what is already there: keep HTTP concerns in the
handler, use the shared `ok()` wrapper, and use parameterised queries.

### The planner CRUD factory

`src/server/modules/planner/routes.js` builds GET/POST/PUT/DELETE for eight
sub-resources (committees, volunteers, risks, vendors, timeline, logistics,
marketing, meetings) from one `crud()` factory. Table and column names come
from an internal config object, never from user input, and all values are
parameterised. It is the best-structured code in the backend — use it as the
model for anything similar.

---

## 6. Authentication and RBAC

### Passwords

Stored as `scrypt$<salt>$<derived>` — the only format that can authenticate.
`verifyPassword` rejects any stored value that is not a `scrypt$` hash, so a
legacy or sentinel row can never be signed into. Such rows must be reset out of
band (hash a new password with `hashPassword` and update the row); the login
handler never silently upgrades them.

### Sessions

A signed token, not a JWT library:

```
base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET))
payload = { uid, role, exp }        TTL: 12 hours
```

Sent as `Authorization: Bearer <token>`. `attachUser` runs on every request and
populates `req.user` when the token verifies; it never rejects. Guards do that:

| Guard | Behaviour |
|---|---|
| *(none)* | Public |
| `requireAuth` | 401 without a valid token |
| `requireRole(...roles)` | 401 without a token, 403 if the role is not listed |

### Roles

Five roles, enforced by a `CHECK` constraint in `db/schema.sql`:

```js
ADMIN_ROLES     = ['super_admin', 'univ_admin']
MODERATOR_ROLES = ['super_admin', 'univ_admin', 'dept_admin', 'moderator']
```

| Role | Label | Scope |
|---|---|---|
| `alumni` | Alumni Member | Profile, directory, mentorship, events, jobs, news |
| `moderator` | Moderator | + content moderation, event management, check-in |
| `dept_admin` | Dept Admin | + department-scoped administration |
| `univ_admin` | College Admin | + college-wide administration, campaigns, broadcasts |
| `super_admin` | Super Admin | + bulk import, custom fields, vault, audit, seeding |

> The `admin.js` "12 roles" table in the client is a **display-only governance
> matrix**. It is not wired to any permission check. The five roles above are
> the real model.

### Seeded accounts

`db/seed.sql` creates these rows **login-disabled**. Their `password_hash` is
the sentinel `disabled:set-via-bootstrap`, which is not a `scrypt$` hash and
therefore can never authenticate. No password ships with this repository.

| Email | Role |
|---|---|
| `admin@dic.edu.bd` | `super_admin` |
| `collegeadmin@dic.edu.bd` | `univ_admin` |
| `departmentadmin@dic.edu.bd` | `dept_admin` |
| `moderator@dic.edu.bd` | `moderator` |
| `alumni@dic.edu.bd` | `alumni` |

> **To sign in as one of these roles, provision a password out of band:**
> generate a hash with `hashPassword` from
> `src/server/middleware/auth.js` and `UPDATE users SET password_hash = ...`
> for that row. Never commit a password — shared, default, or otherwise — to
> the repository or the seed script.

---

## 7. API surface

All endpoints are under `/api`. Every error response is `{ "error": "<message>" }`.
Successful responses are mostly bare objects or arrays; two exceptions worth
knowing:

- `GET /api/alumni` returns `{ alumni, total, limit, offset }` — the only
  paginated envelope.
- `GET /api/mentorships` returns `{ asMentee, asMentor, incoming }` — the only
  object-shaped list.

| Family | Endpoints | Notes |
|---|---|---|
| `/api/auth/*` | login, register, change-password, me | login and register are public |
| `/api/alumni` | directory list, detail | server-side search/filter/sort/paging |
| `/api/profile/me` | get, update | 20 whitelisted editable fields |
| `/api/chapters` | list, create, join, members | |
| `/api/stories` | list, create | list is public |
| `/api/moderation/*` | queue, approve/reject | moderator+ |
| `/api/notifications` | list, mark read | |
| `/api/bulk-import` | CSV import, history | admin only |
| `/api/events/*` | CRUD, registration, tickets, check-in | signed QR tickets |
| `/api/jobs/*` | CRUD, apply, applicants, refer | ownership-checked |
| `/api/campaigns`, `/api/donations/*` | fundraising, leaderboard | |
| `/api/mentorships/*` | request, respond, suggestions | weighted matching |
| `/api/connections`, `/api/polls/*`, `/api/broadcasts` | community | |
| `/api/planner/*` | full event-planning workspace | 8 CRUD sub-resources + analytics, report, workspace |
| `/api/consent`, `/api/vault/*`, `/api/dsar/*` | PDPA 2026 compliance | |
| `/api/audit-logs` | hash-chained audit trail | admin only |
| `/api/health` | status probe | public |

To see the live table, in registration order with its guards:

```bash
npm run routes
```

### Compliance features

- **Consent logging** — IP, timestamp and policy version recorded per consent.
- **Identity vault** — NID/BRC encrypted at rest with AES-256-GCM. Decryption
  is admin-only, requires a stated reason, and every access is logged to
  `vault_access_logs`.
- **DSAR** — subjects can export their data as JSON or CSV, and request
  deletion with a 30-day grace period they can cancel.
- **Audit trail** — each entry hashes the previous entry's hash, so an edited or
  deleted row breaks verification.

---

## 8. Frontend architecture

`index.html` is the shell: 14 page containers, populated by JavaScript. There
is no router — `showPage(name)` toggles container visibility.

Scripts load as **22 ordered classic `<script>` tags**, sharing one global
scope:

```
core/api-client.js   →  core/state.js  →  core/helpers.js  →  core/auth.js
  →  core/app-shell.js  →  features/*  →  core/runtime.js (boot)
```

`src/client/core/api-client.js` is the only place that talks to the API. It
attaches the bearer token, applies a 10-second timeout, and drops the user back
to the login screen on a 401 from a non-auth endpoint.

Files under `src/client/features/` were produced by a **contiguous split** of
the original 6,352-line `app.js` — cut at line boundaries with nothing
reordered. Because features had accumulated in non-adjacent regions of that
file, a few files still hold more than one domain and are named honestly for
what they contain (`gap-fixes-req.js`, `chapters-planner-tabs.js`) rather than
given a tidy name that would misrepresent them.

Each file's header comment records the original `app.js` line range it covers.
To find where something went:

```bash
npm run where -- renderAlumniGrid
#  → src/client/features/directory.js:35

npm run where            # the full file/range map
```

---

## 9. Rules that are easy to break

These are not style preferences. Each one has bitten this codebase.

### Never add `type="module"` to a client script

Roughly **121 inline `onclick=` / `onchange=` / `onsubmit=` handlers** in
`index.html` and in generated markup resolve function names against `window`.
Classic scripts put top-level function declarations on `window` automatically,
which is the only reason they work. Module scope would break all 121 at once,
silently — no error, just buttons that do nothing.

`npm run check:handlers` asserts every handler still resolves.

### Never reorder top-level code in the client

Four functions are **defined twice on purpose**. They are decorator wrappers:

```js
function filterDirectory(value) { … }        // original
const _origFilterDir = filterDirectory;      // captures it
filterDirectory = function (value) {         // replaces it
  …; _origFilterDir(value);                  // and delegates back
};
```

Three of the four call their captured original. Deleting the first definition —
or hoisting the second over it — makes the wrapper capture *itself* and recurse
forever. The same applies to `switchAnalytics`, `filterEvents` and
`switchAdmin`, and it holds across files: each original must load before its
override.

`npm run check:handlers` reports these separately from real duplicates so they
are not mistaken for dead code.

### Route registration order is part of the program

Express matches in declaration order. Concrete paths must register before
parameterised ones — `/api/events/planner/:id` and `/api/events/proposals` are
declared in `server.js` *before* the `/api/events/:id` routes in the events
module. `src/server/modules/index.js` mounts the domains in a fixed order, and
the three tail middlewares (`/api` 404, static 404, SPA fallback) must stay
after every route.

Diff `npm run routes` before and after any change to mounting.

### Adding a file to the repo does not make it public

`src/server/middleware/static-assets.js` serves an **allow-list**, not the
directory tree. This is deliberate: the app previously ran
`express.static(__dirname)` over the repository root, which served `/server.js`,
`/db.js`, `/schema.sql` and `/seed.sql` — the whole auth implementation and the
seed credentials — to anyone who asked.

New public assets must be added to `PUBLIC_FILES` or covered by a
`PUBLIC_PREFIXES` entry. Everything else 404s, and `npm run contract` asserts
that `/server.js` and `/db/seed.sql` stay unreachable.

### Do not move `server.js`

`api/index.js` requires `../server`, and Vercel's zero-config function
detection expects `api/index.js` at that exact path. Filesystem paths are
centralised in `src/server/config/paths.js` — use them rather than
recomputing `__dirname` chains.

---

## 10. Verification

The repository has no unit test suite. What it has instead is a set of tools
that assert the things most likely to break silently. Run them all:

```bash
npm run verify
```

| Command | What it asserts |
|---|---|
| `npm run check:syntax` | every tracked `.js` file parses |
| `npm run check:client` | the client scripts load in one shared scope, and every inline handler in `index.html` resolves at runtime |
| `npm run check:handlers` | every inline handler resolves; wrappers separated from duplicates |
| `npm run routes` | dumps the route table in registration order |
| `npm run contract` | probes every route and records the auth matrix and response shapes |
| `npm run where -- <symbol>` | locates a symbol after the reorganization |
| `npm run test:e2e` | raw-SQL CRUD against 4 tables (needs a live database) |

### Using the contract snapshot

`npm run contract` boots the app, probes all 127 routes, and prints a
diffable snapshot. Compare against the committed baseline:

```bash
npm run contract > /tmp/after.txt
diff tools/api-contract.baseline.txt /tmp/after.txt
```

An empty diff means the auth matrix and response shapes are unchanged. This is
the regression gate for any backend change.

**It is non-destructive by construction.** Reads are probed anonymously, as an
alumnus and as an admin. Writes are probed **anonymously only**, so the guard
rejects with 401 before any handler can touch the database. Do not "improve"
this by adding authenticated write probes — it points at the real database.

### Coverage, stated plainly

`tests/e2e-crud.js` exercises raw SQL against 4 of 39 tables and **zero HTTP
routes**. It would catch a broken connection or a broken query shape; it would
not catch a broken endpoint, guard, or validation rule. The contract snapshot
covers auth and response shape across all routes but asserts nothing about
correctness. Real route tests are the biggest missing piece.

---

## 11. Deployment

Vercel, zero-config plus one rewrite:

- `api/index.js` re-exports the Express app; Vercel turns it into a serverless
  function.
- `vercel.json` rewrites `/api/(.*)` to it.
- Static files are served by Vercel's CDN from the repository root.

Set `DATABASE_URL`, `SESSION_SECRET` and `ENCRYPTION_KEY` in the project's
environment variables before deploying.

**Serverless notes.** The pg pool is created once per cold start — that is the
correct pattern; do not move pool creation into a request handler. Nothing in
the backend uses `setInterval` or otherwise assumes a long-lived process, with
one exception: an unset `SESSION_SECRET` generates a different random secret per
instance, so tokens fail verification across instances. Set it.

> **Open issue (SEC-6).** The static allow-list protects the Node server. On
> Vercel the CDN serves the repository root *before* the function runs, so
> backend source may still be fetchable in production. The fix is to move web
> assets into a `public/` directory — Vercel then serves only that — or add a
> `.vercelignore`. Both change the deployment layout and have not been applied.

---

## 12. Known issues

Two files track them:

- **`tools/known-issues.json`** — machine-readable. `npm run verify` reads it,
  failing on anything *not* listed so the gate stays meaningful. It should only
  ever shrink.
- **`docs/findings.md`** — the human-readable register, with evidence and the
  reason each item was recorded rather than fixed.

The ones to read first:

| | |
|---|---|
| **A donor can confirm their own payment** | `POST /api/donations/:id/confirm` authorises on `donor_user_id === req.user.uid` with `success` defaulting to true. Any user can mark their own donation SUCCESS, mint a receipt, and inflate campaign totals — with no money moving. Needs a signed gateway webhook. |
| **The `moderator` role is inert** | The backend authorises it for moderation, event CRUD, check-in and planner CRUD; the sidebar hides every one of those pages from it. |
| **Failed writes report success** | Three planner handlers do `list.push(newX ⏐⏐ {id: Date.now(), …})` then show a success toast, so a failed save produces a phantom row. Root cause: `api-client.js` carries two incompatible error conventions. |
| **Event proposals can never be approved** | Three backend endpoints exist; the moderation panel drops `pendingProposals` and no approve control exists. |
| **The profile page shows hardcoded data** | `FULL_USER_PROFILE` is a mock never hydrated from the API, and saved edits never appear in it. |
| **Ticket signatures can be forged** | HMAC falls back to the literal `'dic-ticket'` when `ENCRYPTION_KEY` is unset. |
| **Nine tables lack an `event_id` index** | The most-filtered column in the codebase (30+ `WHERE` clauses). |

Full architectural write-up, migration matrix and ranked next steps:
**`docs/code-organization.html`**.

---

## 13. Working on this codebase

### Adding an API endpoint

1. Pick the domain module under `src/server/modules/`, or `server.js` if it
   belongs with the routes declared there.
2. Add the route with an explicit guard — `requireAuth` or
   `requireRole(...ADMIN_ROLES)`. Public is a decision, not a default.
3. Wrap the body in `ok(res, async () => { … })` from `shared/http.js`.
4. Use parameterised queries. Never interpolate user input into SQL.
5. Add the matching method to `src/client/core/api-client.js` — the client does
   not call `fetch` directly (the two file-download helpers are the documented
   exception).
6. Run `npm run routes` and confirm the new route lands where you expect,
   especially if the path has a parameter segment.
7. Run `npm run contract` and diff against the baseline. Update
   `tools/api-contract.baseline.txt` in the same commit as an intentional
   contract change.

### Adding a client feature

1. Put it in the relevant `src/client/features/` file, or add a new one and
   register it in `index.html` **in the right order**.
2. If markup calls a function from an inline handler, it must be a top-level
   `function` declaration — not a `const` arrow, which is not on `window`.
3. Run `npm run verify`.

### Before you commit

```bash
npm run verify
```

If you changed anything on the backend, also diff the contract:

```bash
npm run contract > /tmp/after.txt && diff tools/api-contract.baseline.txt /tmp/after.txt
```

### Conventions

- Backend files: kebab-case. Modules are directories with `routes.js`.
- SQL: uppercase keywords, parameterised values, `snake_case` columns.
- Client: `camelCase` functions, `SCREAMING_SNAKE` for module-level constants.
- Comments explain *why*, not *what*. Several in this codebase document
  non-obvious constraints — those are load-bearing; leave them.

---

## Project history

Built as a mock-data prototype, then converted to a real PostgreSQL backend,
then extended in phases (`REQ-xx` blocks, an event-planner workspace, PDPA
compliance, bulk import). Each phase was appended rather than integrated, which
is why the code was reorganized: the backend was five flat files in the web
root, and `app.js` had reached 6,396 lines with every feature scattered across
four to eight non-adjacent regions.

That reorganization preserved behaviour exactly — verified at every step
against a route-order baseline, a live API contract snapshot and a client
global-surface dump. `docs/code-organization.html` records what changed, what
was found along the way, and what deliberately was not touched.
