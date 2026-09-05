-- ============================================================
-- DIC ALUMNI PLATFORM — SCHEMA v10
--
-- Backs four changes that close CRITICAL audit findings:
--
--   1. Honest payments. A donation reaches SUCCESS only when a human with
--      finance authority attests that money arrived, and the row records who
--      said so and against which real-world transaction reference. Same for a
--      paid event ticket.
--   2. Automated purge. deletion_requests.purge_after was written and never
--      read; the columns here let a purge run be recorded and made idempotent.
--   3. Resume upload. Files live in Postgres as bytea — the deployment target
--      is Vercel serverless, whose filesystem is ephemeral, and no storage SDK
--      may be added (four runtime dependencies, frozen).
--   4. Erasure tombstones on users.
--
-- ADDITIVE AND IDEMPOTENT ONLY. No DROP. No NOT NULL without a DEFAULT. Every
-- statement is safe to run twice and safe against the 194 existing users and
-- the 8 existing SUCCESS donations — none of which this migration rewrites.
--
-- Run with:  node scripts/migrate-v10.js
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. DONATION SETTLEMENT (manual reconciliation)
--
-- The status CHECK is untouched: PENDING/SUCCESS/FAILED/REFUNDED still hold.
-- A pledge IS the existing PENDING state — no new status value is introduced,
-- so every existing row, index and client-side status branch keeps working.
-- What changes is who may move a row out of PENDING, and the evidence the row
-- must carry when it moves. Those are the columns below.
-- ────────────────────────────────────────────────────────────

-- The staff member who attested that the money arrived. NULL on the 8 legacy
-- SUCCESS rows, which predate attestation — that NULL is the honest answer to
-- "who confirmed this?", not a defect.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS settled_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- The real-world transaction identifier: a bKash TrxID, a Nagad reference, a
-- bank deposit slip number. This is the audit artefact that makes a SUCCESS
-- row checkable against a bank statement.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS settlement_reference VARCHAR(120);

-- How the money actually arrived, which is not necessarily payment_gateway —
-- that column records the donor's stated intent at pledge time.
ALTER TABLE donations ADD COLUMN IF NOT EXISTS settlement_method VARCHAR(40);

ALTER TABLE donations ADD COLUMN IF NOT EXISTS settlement_note TEXT;
ALTER TABLE donations ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;

-- Drives the finance reconciliation queue (oldest outstanding pledge first).
CREATE INDEX IF NOT EXISTS idx_donations_status_created ON donations(status, created_at);


-- ────────────────────────────────────────────────────────────
-- 2. EVENT TICKET PAYMENT (same principle)
--
-- amount_paid used to be stamped with the event's ticket price at the moment
-- of registration, with no collection step anywhere — so the column asserted
-- money that had never moved. amount_due now carries the obligation and
-- amount_paid only ever moves under a staff confirmation.
-- ────────────────────────────────────────────────────────────

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS payment_status VARCHAR(24) NOT NULL DEFAULT 'unpaid';
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS payment_confirmed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120);

-- ADD CONSTRAINT has no IF NOT EXISTS, so it is guarded by name. NOT VALID
-- skips the full-table verification scan: every pre-existing row was given the
-- column DEFAULT 'unpaid' and the backfill below only writes allowed values,
-- so there is nothing to verify, and NOT VALID guarantees the statement cannot
-- fail against production data. New and updated rows are still checked.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_registrations_payment_status_check') THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT event_registrations_payment_status_check
      CHECK (payment_status IN ('unpaid','paid','waived','refunded','legacy_unverified')) NOT VALID;
  END IF;
END $$;

-- Backfill. Rows that already carry a non-zero amount_paid were written by the
-- old registration path, which set it without any collection step. Their
-- amount_paid is DELIBERATELY LEFT AS IT IS — this migration destroys no data
-- and the finance owner decides whether those figures stand. What it does is
-- stop them being silently trusted: the obligation is recorded in amount_due
-- and the row is marked 'legacy_unverified' so it shows up as needing
-- reconciliation instead of reading as a settled payment.
-- Idempotent: after the first run these rows no longer have payment_status
-- 'unpaid', so a second run matches nothing.
UPDATE event_registrations
   SET amount_due = amount_paid,
       payment_status = 'legacy_unverified'
 WHERE payment_status = 'unpaid'
   AND amount_paid > 0;

CREATE INDEX IF NOT EXISTS idx_registrations_payment ON event_registrations(payment_status);


-- ────────────────────────────────────────────────────────────
-- 3. RESUME FILES (REQ-07)
--
-- bytea, not a filesystem path: on Vercel the filesystem is ephemeral, so a
-- file written to disk is gone by the next invocation. No object-storage SDK
-- may be added (the four-dependency budget is frozen), which leaves the
-- database as the only durable store available.
--
-- byte_size is stored explicitly rather than computed with length(content) so
-- the applicants listing can show a size without pulling megabytes of bytea
-- into memory. sha256 makes a re-upload of an identical file detectable and
-- gives the DSAR export something to cite without embedding the file.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resume_files (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      VARCHAR(255) NOT NULL,
  content_type  VARCHAR(100) NOT NULL,
  byte_size     INTEGER NOT NULL,
  sha256        CHAR(64) NOT NULL,
  content       BYTEA NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resume_files_user ON resume_files(user_id, created_at DESC);

-- An application points at an uploaded file. resume_url is kept: it still
-- holds the LinkedIn/Drive links people have already submitted, and removing
-- it would lose them.
ALTER TABLE job_applications ADD COLUMN IF NOT EXISTS resume_file_id INTEGER REFERENCES resume_files(id) ON DELETE SET NULL;


-- ────────────────────────────────────────────────────────────
-- 4. ERASURE (PDPA 2026, 30-day purge)
--
-- The purge tombstones the users row rather than deleting it. Deleting it
-- would cascade through fourteen ON DELETE CASCADE foreign keys and take other
-- people's data with it — every story the person wrote, every job they posted
-- and therefore every OTHER alumnus's application to those jobs. Overwriting
-- the identifiers achieves erasure (nothing identifying remains) without
-- destroying records that belong to third parties or carry legal retention.
-- ────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS erased_at TIMESTAMPTZ;

-- Records that a purge ran, so the sweep is idempotent and so a regulator can
-- be shown when the promised 30-day deletion actually executed.
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;
ALTER TABLE deletion_requests ADD COLUMN IF NOT EXISTS purge_summary JSONB;

-- The sweep's driving query: pending requests whose purge_after has passed.
CREATE INDEX IF NOT EXISTS idx_deletion_requests_due ON deletion_requests(status, purge_after);

-- Excludes tombstoned accounts from directory and login queries cheaply.
CREATE INDEX IF NOT EXISTS idx_users_erased ON users(erased_at);
