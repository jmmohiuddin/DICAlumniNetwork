-- ============================================================
-- DIC ALUMNI PLATFORM — SCHEMA v11
-- Alumni verification review state.
--
-- Additive and idempotent, like every migration in this project. Safe to run
-- more than once and safe against the existing rows.
--
-- Why this exists
-- ---------------
-- `users.is_verified` is a boolean, so it can record that an account was
-- approved but not that it was *reviewed and turned down*. Without that
-- distinction a rejected account is indistinguishable from one nobody has
-- looked at yet, so it returns to the review queue forever and the reviewer
-- re-decides the same case every day.
--
-- Note there is no `is_suspended` column on this branch, so rejection cannot
-- reuse one. Rejection is recorded here instead, and it is deliberately not a
-- DELETE: an account rejected in error must be recoverable, and deleting the
-- row would also orphan the audit entries that reference it.
-- ============================================================

-- pending  — awaiting human review (the default for anything new)
-- approved — a reviewer confirmed the person; mirrors is_verified = TRUE
-- rejected — a reviewer turned it down, with a reason, and it leaves the queue
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewed_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMP;

-- Backfill from the existing boolean so the queue is correct the moment this
-- lands: every account already marked verified counts as reviewed and approved,
-- everything else is genuinely pending. Guarded on the default value so a
-- re-run cannot overwrite a real review decision made after the first run.
UPDATE users
   SET verification_status = 'approved',
       verification_reviewed_at = COALESCE(verification_reviewed_at, created_at)
 WHERE is_verified = TRUE
   AND verification_status = 'pending';

-- Constrain the vocabulary. Added separately and guarded, because ADD
-- CONSTRAINT has no IF NOT EXISTS in PostgreSQL and this file must stay
-- re-runnable.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_verification_status_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_verification_status_check
      CHECK (verification_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- The review queue reads exactly one shape: pending accounts, oldest first.
CREATE INDEX IF NOT EXISTS idx_users_verification_queue
    ON users (verification_status, created_at)
 WHERE verification_status = 'pending';
