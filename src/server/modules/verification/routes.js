/* ============================================================
   DIC ALUMNI PLATFORM — ALUMNI VERIFICATION QUEUE

   Owns: GET  /api/verification/queue
         POST /api/verification/:id/approve
         POST /api/verification/:id/reject

   Why this module exists
   ----------------------
   `users.is_verified` gates what an account can see and do, and the original
   PRD names the review step in three separate places — the RBAC matrix ("User
   Profile Verification"), Journey A ("Unmatched → Manual Admin Review Queue")
   and the Executive Command Center layout ("Real-time pending alumni
   verification queue card"). None of it was ever built. The queue rendered on
   the dashboard was a two-entry hardcoded array in the client
   (MOCK_VERIFICATION_QUEUE: "Rafiq Hossain", "Sumaiya Zaman"), its Approve
   button called nothing, and no endpoint anywhere could flip is_verified.

   It became urgent rather than merely missing when bulk import stopped marking
   imported accounts as verified. Import previously inserted rows with
   is_verified = TRUE alongside a shared default password; both were removed as
   part of the credential hardening, which is correct — an imported row is an
   unproven claim about a person until a human checks it. But that left every
   imported account permanently unverified with no mechanism to approve it.
   This module is that mechanism.

   Authorisation
   -------------
   MODERATOR_ROLES may read the queue and act on it. That follows the PRD's own
   RBAC matrix, which grants profile verification to the Alumni Director tier
   and above rather than restricting it to a super admin. Rejection is the more
   consequential action, so it requires a written reason, records the reviewer,
   and is audited. It is never a hard delete: an account rejected in error must
   be recoverable.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

module.exports = function mountVerification(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

  /* Pending accounts, oldest first — a queue, not a feed. The oldest unverified
   * account is the one that has been waiting longest on a real person, so it
   * sorts to the top. Capped so a large import cannot return 40,000 rows to a
   * dashboard card. */
  app.get('/api/verification/queue', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);

    const rows = await db.query(`
      SELECT u.id, u.full_name, u.initials, u.email, u.department, u.role,
             u.created_via, u.created_at,
             ap.batch, ap.student_id, ap.department AS profile_department
      FROM users u
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE u.verification_status = 'pending'
      ORDER BY u.created_at ASC, u.id ASC
      LIMIT $1
    `, [limit]);

    // The total is reported separately from the page so the dashboard badge can
    // say "25 of 312 pending" rather than implying the queue is only 25 deep.
    const total = await db.query("SELECT COUNT(*)::int AS n FROM users WHERE verification_status = 'pending'");

    res.json({
      total: total.rows[0].n,
      items: rows.rows.map(r => ({
        id: r.id,
        name: r.full_name,
        initials: r.initials,
        email: r.email,
        batch: r.batch || null,
        studentId: r.student_id || null,
        department: r.profile_department || r.department || null,
        // How the account got here matters to the reviewer: a bulk_import row
        // came from a spreadsheet the institution supplied, a self-signup row
        // is an unverified claim by a member of the public.
        source: r.created_via || 'unknown',
        createdAt: r.created_at,
      })),
    });
  }));

  /* Approve: the reviewer asserts this person is who the record says they are. */
  app.post('/api/verification/:id/approve', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });

    // Guarded on verification_status = 'pending' so a double-submit (or two reviewers
    // clicking at once) approves once and reports honestly the second time,
    // instead of writing a duplicate audit entry for a no-op.
    const updated = await db.query(
      `UPDATE users
          SET is_verified = TRUE,
              verification_status = 'approved',
              verification_reviewed_by = $2,
              verification_reviewed_at = NOW(),
              verification_reason = NULL
        WHERE id = $1 AND verification_status = 'pending'
        RETURNING id, full_name, email`,
      [id, req.user.uid]
    );

    if (updated.rows.length === 0) {
      const exists = await db.query('SELECT verification_status FROM users WHERE id = $1', [id]);
      if (exists.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      return res.status(409).json({ error: `That account has already been reviewed (${exists.rows[0].verification_status})` });
    }

    const u = updated.rows[0];
    await writeAudit(
      'Alumni Verified',
      `user ${req.user.uid} verified account ${u.email} (id ${u.id})`,
      '✅'
    );

    res.json({ verified: true, id: u.id, name: u.full_name });
  }));

  /* Reject: record the decision rather than delete the account.
   *
   * A rejected account keeps its row — the person may have made an honest
   * mistake on a form, and a hard delete would also orphan the audit entries
   * that reference them. `is_verified` stays FALSE and the row moves to
   * 'rejected', so it leaves the queue instead of being re-decided every day.
   * The state lives in verification_status (schema_v11.sql); there is no
   * is_suspended column on this branch to reuse. */
  app.post('/api/verification/:id/reject', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid user id' });

    const reason = String(req.body?.reason || '').trim();
    // A rejection that no one can explain later is not a decision, it is a
    // disappearance. The reason is required and it goes into the audit entry.
    if (reason.length < 3) {
      return res.status(400).json({ error: 'A reason is required to reject an account' });
    }
    if (reason.length > 500) {
      return res.status(400).json({ error: 'Reason must be 500 characters or fewer' });
    }

    const updated = await db.query(
      `UPDATE users
          SET is_verified = FALSE,
              verification_status = 'rejected',
              verification_reason = $3,
              verification_reviewed_by = $2,
              verification_reviewed_at = NOW()
        WHERE id = $1 AND verification_status = 'pending'
        RETURNING id, full_name, email`,
      [id, req.user.uid, reason]
    );

    if (updated.rows.length === 0) {
      const exists = await db.query('SELECT verification_status FROM users WHERE id = $1', [id]);
      if (exists.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      return res.status(409).json({ error: `That account has already been reviewed (${exists.rows[0].verification_status})` });
    }

    const u = updated.rows[0];
    await writeAudit(
      'Alumni Verification Rejected',
      `user ${req.user.uid} rejected account ${u.email} (id ${u.id}) — ${reason}`,
      '🚫'
    );

    res.json({ rejected: true, id: u.id, name: u.full_name });
  }));
};
