# Findings register

Everything below was found during the code-organization pass and **verified by
running or grepping**, not by reading and inferring. None of it was fixed in
that pass unless the Status column says so — these are behaviour changes and
product decisions, which is a different job from reorganizing files.

Machine-checkable entries also live in `tools/known-issues.json`, which
`npm run verify` reads. This file is the human-readable detail.

---

## A. Security

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| SEC-0 | Critical | `express.static(__dirname)` served the whole repo: `/db.js`, `/server.js`, `/schema.sql`, `/seed.sql` all returned 200 with real content. | **Fixed** — allow-list in `src/server/middleware/static-assets.js` |
| SEC-1 | High | Donor can confirm their own payment | Open |
| SEC-2 | Medium | Ticket HMAC falls back to hardcoded `'dic-ticket'` | Open |
| SEC-3 | Medium | Two endpoints answer unauthenticated callers | Open |
| SEC-4 | Low | `ok()` returns `err.message` to the client | Open |
| SEC-5 | Low | DB pool sets `rejectUnauthorized: false` | Open |
| SEC-6 | Info | Vercel CDN still serves repo root in production | Open |
| SEC-7 | Medium | See below | Open |

### SEC-1 — A donor can mark their own donation successful
`src/server/modules/giving/routes.js`, `POST /api/donations/:id/confirm`.
Authorises on `donor_user_id === req.user.uid`, and `success` defaults to
`true` when the body omits it. Any authenticated user can POST for their own
pending donation and have it written as `SUCCESS` with a receipt code, with no
money moving — which also inflates campaign totals and the donor leaderboard.
The donor is precisely the party with an incentive to lie, so ownership is the
wrong condition. Correct confirmation must come from a signed gateway webhook
(bKash/Nagad/card) or a service-role route keyed on a per-transaction token the
gateway issues.

### SEC-3 / SEC-7 — Unauthenticated data exposure
`GET /api/chapters/:id/members` and `GET /api/events/planner/:id` both return
200 with real rows and no token — verified live in the contract baseline. The
planner endpoint exposes an event's budgets, committees, sponsors, tasks and
volunteers.

**SEC-7 makes the first one worse:** when a chapter has no memberships, the
handler falls back to returning *the first four users in the entire `users`
table*, regardless of chapter. So an unauthenticated request for a nonexistent
or empty chapter leaks arbitrary user records.

---

## B. Correctness bugs

### BUG-1 — The profile page shows hardcoded data to every user
`FULL_USER_PROFILE` (app.js:4288) and `PROFILE_PRIVACY_SETTINGS` are mock
objects holding one person's name, student ID, address and phone. Nothing
hydrates them from the API, but `render10SectionProfile()` is live — called
from `showPage()` whenever the profile page opens. The *edit* form is
API-backed and saves real changes, so edits never appear in the hub that
displays them.

### BUG-2 — Failed writes report success and fabricate rows
`handleAddBudgetSubmit`, `handleAddSponsorSubmit`, `handleAddTaskSubmit`
(app.js:1885, 1948, 2007) follow this pattern:

```js
const newX = await API.addEventX(...);
list.push(newX || { id: Date.now(), ...fabricated });
showToast('✅ … saved successfully!');
```

On failure `newX` is `null`, so the code invents a row with a client-side id,
pushes it into the planner cache, and still reports success. The user sees an
item that was never persisted and vanishes on the next real fetch.

### BUG-3 — Other silent failures
- `handleModerateChapter` / `handleModerateStory` (app.js:4886-4903) always
  show "✅ Approved/Rejected" regardless of the API result.
- `handleCreateProposalSubmit` (app.js:1833) shows "✅ Event Proposal Approved"
  when the backend actually created it as `pending_approval`, and never checks
  for an error — a 500 still shows the success toast.
- `moveTaskStatus` (app.js:1762) mutates the local planner cache without
  checking the result, so a failed PUT leaves the UI showing a status that was
  never saved.

### BUG-4 — The `moderator` role cannot reach anything it is allowed to do
The backend authorises `moderator` (via `MODERATOR_ROLES`) for chapter and
story moderation, event CRUD, ticket check-in, attendee lists and all planner
CRUD. The sidebar (`renderSidebarNav`, app.js:249-268) gates the `admin`,
`events` and `chapters` pages to roles that exclude `moderator`. Of 14 sidebar
items a moderator sees five — none of which is the moderation queue their role
is named for.

### BUG-5 — Event proposals can never be approved through the UI
`POST /api/events/proposals` creates a proposal, and three backend endpoints
exist to approve it (`POST /api/moderation/proposal/:id/:action`,
`GET /api/planner/proposals`, `PUT /api/planner/proposals/:id/status`). None is
reachable: `renderModerationPanel()` destructures only `pendingChapters` and
`pendingStories` from the `GET /api/moderation` response and silently drops
`pendingProposals`, which the backend does return. No approve/reject control
exists anywhere in the UI.

### BUG-6 — Two live widgets have no desktop styling
Three feature rewrites renamed their markup but left the old CSS behind:
- **Donor leaderboard** renders `.donor-row/.donor-rank/.donor-name/…` with no
  base CSS at all (only a mobile-only padding override). The old
  `.leaderboard-item/.rank-badge/…` block (styles.css:3169-3187) is orphaned.
- **Audit log** renders `.audit-entry/.audit-icon/…` with no base CSS. The old
  `.audit-log-item/…` block (styles.css:1555-1561) is orphaned.
- **Broadcast history** was rewritten cleanly onto a shared class, leaving
  ~30 orphaned lines across three breakpoints.

Two of the three are visible bugs, not just dead CSS: those widgets are
unstyled at desktop width.

### BUG-7 — A missing logo 404s four times on every page load
`index.html` lines 46, 165, 211, 1117 use
`<img src="assets/dic-logo.png" onerror="…daffodil-logo.svg">`.
`assets/dic-logo.png` does not exist on disk and never has (verified against
full git history). Every page load issues four failed requests before falling
back to the SVG that does the real work.

### BUG-8 — A route throws on a malformed body
`server.js:1100` destructures `attendance` from `req.body` without a default,
so a request with no body throws `TypeError: Cannot destructure property
'attendance' of req.body` instead of returning 400. Observed during contract
probing.

---

## C. Dead code (verified unreachable)

| What | Where | Evidence |
|------|-------|----------|
| `renderRBACTable()` | app.js:2236-2261 | Only reachable via `typeof renderRBACTableV2 === 'function' ? … : renderRBACTable()`. `renderRBACTableV2` is a hoisted declaration so the branch is never taken — and if it were, it reads `MOCK_RBAC`, which is **never declared** (only `MOCK_RBAC_V2`), so it would throw `ReferenceError`. |
| `startCampaignTicker()` + `MOCK_CAMPAIGNS_LIVE` | app.js:2916-2941 | Called at init, runs `setInterval` every 3.5s forever, targeting `campaign-raised-${id}` / `campaign-pct-${id}` elements that are never created anywhere. The real campaigns page is API-backed. A permanent no-op timer. |
| `seed_cloud.js` | whole file, 51 lines | Zero references repo-wide — no require, no npm script. Duplicates `db.js:initDbSchemaAndSeed()` with its own hand-rolled `Pool`. Superseded. |
| `goToStep1/2/3` | app.js:285-300 | Orphaned onboarding wizard; references `#step-1/2/3`, `.sis-match-animation`, `#sis-result`, none of which exist in index.html. |
| `animateKPIs` / `animateCounter` | app.js:757, 768 | Never called; the whole KPI count-up animation is inert. |
| `showTenantSwitcher` / `switchTenant` | app.js:2747, 2766 | No control invokes them. |
| `toggleProgressiveDisclosure` | app.js:2855 | The mobile Show More/Less helper is wired to nothing. |
| 16 `API.*` methods | api.js | Never called: `connectWith`, `getConnections`, `getEventPlanner`, `getImportHistoryV2`, `getPlannerList`, `getProposals`, `setProposalStatus`, `moderateProposal`, `updateCampaign`, `updateEvent`, `updateJob`, `updatePlannerItem`, `addEventProcurement`, `deleteEvent`, `health`. |

The "Connect" button is worth calling out: `connectAlumni()` (app.js:1037) only
sets local state and shows a toast. It never calls the API. The connections
feature is fully implemented server-side (table, two endpoints, two client
methods) and completely unwired.

---

## D. Database

**Missing indexes.** `event_id` is the most-filtered column in the codebase —
`WHERE event_id = $1` appears 30+ times — but nine event-planner tables carry a
bare `event_id INT DEFAULT 1` with no FK and no index:
`event_committees`, `event_procurement`, `event_volunteers`, `event_risks`,
`event_vendors`, `event_timeline`, `event_logistics`, `event_marketing`,
`event_meetings`. Only `event_tasks`, `event_budgets`, `event_sponsors` and
`event_registrations` are indexed. Invisible at current row counts; every one
of those queries is a full table scan the moment the data grows.

**No migration tracking.** `db.js:initDbSchemaAndSeed()` applies only
`schema.sql` + `seed.sql`. `schema_v2.sql` and `schema_v3.sql` are applied only
by running `scripts/migrate-v2.js` / `migrate-v3.js` by hand. There is no
migrations table and nothing enforces order, so a fresh environment stood up
from `initDbSchemaAndSeed` alone gets the v1 schema only, and the v2/v3 tables
and columns simply do not exist. Both scripts are idempotent
(`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`), so re-running is safe.

**Schema and code agree.** All 39 tables defined across the three schema files
are referenced by code, and every table the code touches is defined. No drift.

**Seed credentials.** `db/seed.sql` seeds five demo accounts whose
`password_hash` is the literal string `12345678` — not a hash. The application
upgrades these to scrypt on first successful login, so this is a seeding
artifact rather than a live auth flaw, but the file should not be world-readable
(see SEC-0, now fixed).

---

## E. Documentation accuracy

- **`README.md`** — "How to Run Locally" says `python3 -m http.server 8000`,
  which serves static files only. The app is an Express + PostgreSQL server;
  every API call fails under those instructions. There is no correct run
  instruction in the README. (`npm start` now exists.)
- **`implementation_plan.md`** — describes a Next.js + TypeScript + zustand +
  framer-motion architecture that was never built. None of it exists. It is a
  discarded plan, not a description of the system.
- **`AUDIT.md`** — internally contradictory. Its opening summary table says
  "server.js (514 L), 20 endpoints, 20 tables"; the actual numbers are ~1,190
  lines, 127 routes and 39 tables, and the same file's later sections describe
  the newer work correctly.

---

## F. Duplication not yet collapsed

| What | Where | Est. |
|------|-------|------|
| `ok()` wrapper | 4 byte-identical copies | **Collapsed** — now `shared/http.js` |
| `SELECT full_name FROM users WHERE id=$1` | 8 sites, just to label a notification | ~8 lines |
| CSV-flattening idiom | `planner/routes.js` and `compliance/routes.js` | ~25 lines |
| server.js try/catch → 500 | 32 hand-rolled sites that `ok()` already encapsulates | ~64 lines |
| api.js fetch boilerplate | ~29 methods repeating 3 templates | ~140 lines |
| Tenant-card markup | 3 renderers build the same card | ~22 lines |
| CSS row-card pattern | 5 classes with identical declarations | ~35 lines |
| Auth-header download logic | `exportUserData` + `downloadEventReport`, both re-reading the token key by literal instead of `getSessionToken()` | ~15 lines |

Roughly **330 LOC** is removable or collapsible, conservatively.

---

## G. Client error handling is two incompatible conventions

`api.js` has two halves:
- **Legacy (~24 methods)** — about half check `res.ok` and return `null` on
  failure; the other half never check at all and just return `res.json()`,
  which only works because the backend happens to send a JSON `{error}` body.
  A non-JSON failure (proxy 502) throws inside `res.json()` and is swallowed
  into `null`, indistinguishable from success at the call site.
- **v2 (~40 methods via `apiRequest`)** — uniformly returns `{error, status,
  data}`, checked with `apiFailed()`.

`login` / `register` / `health` are a third bespoke pattern. There is no single
place that normalises the envelope, which is the root cause of the silent
failures in BUG-2 and BUG-3.
