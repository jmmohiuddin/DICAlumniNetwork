/* ============================================================
   DIC ALUMNI PLATFORM — EVENTS

   Owns: GET/POST/PUT/DELETE /api/events, /api/events/:id/register,
   /api/events/:id/attendees, /api/events/:id/my-ticket, /api/events/checkin,
   /api/events/registrations/:id/payment.

   Full CRUD (table existed, zero endpoints) plus ticketing, registration
   and check-in (REQ-06).

   Also exports two sweep routines — sweepEventStatuses() and
   sweepTaskReminders() — which the compliance module mounts behind the shared
   cron secret at /api/cron/*. They live here because they operate on this
   module's tables; they are mounted there because that is where the cron
   authentication is defined, and duplicating a security check into a second
   file to avoid one import would be the worse trade.
   ============================================================ */

const crypto = require('crypto');
const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');
const { ref } = require('../../shared/reference');
const { ENCRYPTION_KEY, encryptionReady } = require('../../shared/crypto');

/* ─── TICKET SIGNING KEY ───
 * Ticket QR payloads are signed with ENCRYPTION_KEY (64 hex chars, same
 * convention as shared/crypto.js and shared/audit.js). There is deliberately no
 * fallback key: it used to fall back to the literal 'dic-ticket', which lives in
 * this file, so every signature was forgeable by anyone who had read the source.
 * Without the key, issuing refuses rather than minting forgeable tickets. */
if (!encryptionReady) {
  console.error('✖  ENCRYPTION_KEY missing or malformed — event ticket issuing is DISABLED. ' +
                'Tickets are refused rather than signed with a constant key, because a signature ' +
                'anyone can recompute is no signature at all. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

/** The truncated HMAC carried in a ticket QR. Only call when encryptionReady. */
function ticketSignature(ticketCode, eventId, userId) {
  return crypto.createHmac('sha256', Buffer.from(ENCRYPTION_KEY, 'hex'))
               .update(`${ticketCode}:${eventId}:${userId}`).digest('hex').slice(0, 16);
}

module.exports = function mountEvents(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

  /* ══════════════════════════════════════════════════════════
     EVENTS — full CRUD (table existed, zero endpoints)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/events', requireAuth, (req, res) => ok(res, async () => {
    const { status } = req.query;
    const rows = await db.query(`
      SELECT e.*,
             (SELECT COUNT(*)::int FROM event_registrations r
               WHERE r.event_id = e.id AND r.status = 'confirmed') AS registered_live,
             EXISTS (SELECT 1 FROM event_registrations r
                      WHERE r.event_id = e.id AND r.user_id = $1 AND r.status <> 'cancelled') AS is_registered
      FROM events e
      ${status ? 'WHERE e.status = $2' : ''}
      ORDER BY e.id ASC
    `, status ? [req.user.uid, status] : [req.user.uid]);
    res.json(rows.rows);
  }));

  app.post('/api/events', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const { title, eventDate, eventTime, venue, capacity, price, type, emoji } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Event title is required' });
    if (!venue || !venue.trim()) return res.status(400).json({ error: 'Venue is required' });

    const row = await db.query(`
      INSERT INTO events (emoji, title, event_date, event_time, venue, capacity, price, type, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'upcoming') RETURNING *
    `, [emoji || '🎓', title.trim(), eventDate || 'TBA', eventTime || '', venue.trim(),
        parseInt(capacity) || 100, price || 'Free', type || 'Gala']);

    await writeAudit('Event Created', `"${title.trim()}" by user ${req.user.uid}`, '🎪');
    res.json(row.rows[0]);
  }));

  app.put('/api/events/:id', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const { title, eventDate, eventTime, venue, capacity, price, type, status, emoji } = req.body;
    const row = await db.query(`
      UPDATE events SET
        title = COALESCE($2,title), event_date = COALESCE($3,event_date),
        event_time = COALESCE($4,event_time), venue = COALESCE($5,venue),
        capacity = COALESCE($6,capacity), price = COALESCE($7,price),
        type = COALESCE($8,type), status = COALESCE($9,status), emoji = COALESCE($10,emoji)
      WHERE id = $1 RETURNING *
    `, [parseInt(req.params.id), title, eventDate, eventTime, venue,
        capacity ? parseInt(capacity) : null, price, type, status, emoji]);
    if (!row.rows.length) return res.status(404).json({ error: 'Event not found' });
    await writeAudit('Event Updated', `Event ${req.params.id} by user ${req.user.uid}`, '🎪');
    res.json(row.rows[0]);
  }));

  app.delete('/api/events/:id', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const row = await db.query('DELETE FROM events WHERE id = $1 RETURNING title', [parseInt(req.params.id)]);
    if (!row.rows.length) return res.status(404).json({ error: 'Event not found' });
    await writeAudit('Event Deleted', `"${row.rows[0].title}" by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
  }));

  /* ─── TICKETING, REGISTRATION & CHECK-IN (REQ-06) ─── */

  app.post('/api/events/:id/register', requireAuth, (req, res) => ok(res, async () => {
    const eventId = parseInt(req.params.id);
    const { paymentGateway, clientMutationId } = req.body || {};

    // No signing key, no ticket. An unsigned (or constant-signed) ticket is forgeable.
    if (!encryptionReady) {
      return res.status(503).json({ error: 'Ticketing is unavailable: the server signing key is not configured' });
    }

    // Offline replays carry a client mutation id; a duplicate is a no-op.
    if (clientMutationId) {
      const seen = await db.query('SELECT 1 FROM sync_mutations WHERE client_mutation_id = $1', [clientMutationId]);
      if (seen.rows.length) {
        const existing = await db.query(
          'SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2', [eventId, req.user.uid]);
        return res.json({ duplicate: true, registration: existing.rows[0] || null });
      }
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the event row so two concurrent buyers cannot both take the last seat.
      const ev = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      if (!ev.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Event not found' }); }
      const event = ev.rows[0];

      const dup = await client.query(
        'SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2', [eventId, req.user.uid]);
      if (dup.rows.length && dup.rows[0].status !== 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'You already have a ticket for this event', registration: dup.rows[0] });
      }

      const taken = await client.query(
        "SELECT COUNT(*)::int n FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'", [eventId]);
      const status = taken.rows[0].n >= event.capacity ? 'waitlisted' : 'confirmed';

      const ticketCode = ref('DIC-TKT');
      // Signed payload so a scanned QR can be validated rather than trusted.
      const qrPayload = JSON.stringify({
        t: ticketCode, e: eventId, u: req.user.uid,
        s: ticketSignature(ticketCode, eventId, req.user.uid)
      });

      /* ─── AN UNPAID TICKET IS RECORDED AS UNPAID ───
       * amount_paid used to be stamped with the event's ticket price right
       * here, at registration, with no collection step anywhere in the
       * platform — no gateway, no cash-received button, nothing. The column
       * asserted that money had arrived on the strength of the person having
       * clicked "register". Every paid ticket in the system was therefore a
       * false financial record.
       *
       * The price is now an obligation (amount_due) and amount_paid stays 0
       * until a staff member confirms collection through
       * POST /api/events/registrations/:id/payment. A free event has nothing
       * to collect, so it is marked 'waived' rather than left looking
       * outstanding forever. */
      const priceValue = parseFloat(String(event.price).replace(/[^\d.]/g, '')) || 0;
      const paymentStatus = priceValue > 0 ? 'unpaid' : 'waived';

      const reg = await client.query(`
        INSERT INTO event_registrations
          (event_id, user_id, ticket_code, qr_payload, amount_due, amount_paid,
           payment_status, payment_gateway, status)
        VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8) RETURNING *
      `, [eventId, req.user.uid, ticketCode, qrPayload, priceValue,
          paymentStatus, paymentGateway || null, status]);

      if (status === 'confirmed') {
        await client.query('UPDATE events SET registered_count = registered_count + 1 WHERE id = $1', [eventId]);
      }

      if (clientMutationId) {
        await client.query(
          `INSERT INTO sync_mutations (client_mutation_id, user_id, entity, action, payload)
           VALUES ($1,$2,'event_registration','create',$3) ON CONFLICT DO NOTHING`,
          [clientMutationId, req.user.uid, JSON.stringify({ eventId })]);
      }

      await client.query(`
        INSERT INTO notifications (user_id, icon, title, subtitle)
        VALUES ($1, '🎫', $2, $3)
      `, [req.user.uid,
          status === 'confirmed' ? 'Ticket Confirmed ✓' : 'Added to Waitlist',
          status === 'confirmed'
            ? `Your ticket for "${event.title}" is ${ticketCode}.` +
              (priceValue > 0 ? ` ৳${priceValue.toLocaleString()} is payable at the alumni office — your ticket is reserved, not paid.` : '')
            : `"${event.title}" is at capacity — you are on the waitlist.`]);

      await client.query('COMMIT');
      res.json({ registration: reg.rows[0], status, event: event.title, amountDue: priceValue });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  app.delete('/api/events/:id/register', requireAuth, (req, res) => ok(res, async () => {
    const eventId = parseInt(req.params.id);
    const row = await db.query(
      `UPDATE event_registrations SET status = 'cancelled'
       WHERE event_id = $1 AND user_id = $2 AND status <> 'cancelled' RETURNING *`,
      [eventId, req.user.uid]);
    if (!row.rows.length) return res.status(404).json({ error: 'No active ticket found' });
    await db.query('UPDATE events SET registered_count = GREATEST(0, registered_count - 1) WHERE id = $1', [eventId]);

    // Promote the earliest waitlisted person into the freed seat.
    const promoted = await db.query(`
      UPDATE event_registrations SET status = 'confirmed'
      WHERE id = (SELECT id FROM event_registrations
                  WHERE event_id = $1 AND status = 'waitlisted' ORDER BY created_at ASC LIMIT 1)
      RETURNING user_id, ticket_code
    `, [eventId]);
    if (promoted.rows.length) {
      await db.query('UPDATE events SET registered_count = registered_count + 1 WHERE id = $1', [eventId]);
      await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'🎟','A seat opened up — you are in!',$2)`,
        [promoted.rows[0].user_id, `Your waitlisted ticket ${promoted.rows[0].ticket_code} is now confirmed.`]);
    }
    res.json({ success: true, promoted: promoted.rows.length > 0 });
  }));

  app.get('/api/events/:id/attendees', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT r.id, r.ticket_code, r.status, r.checked_in, r.checked_in_at,
             r.amount_due, r.amount_paid, r.payment_status, r.payment_reference, r.paid_at,
             u.id AS user_id, u.full_name AS name, u.initials,
             ap.batch, ap.department AS dept, ap.current_company AS company
      FROM event_registrations r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE r.event_id = $1
      ORDER BY r.status, r.created_at ASC
    `, [parseInt(req.params.id)]);
    res.json(rows.rows);
  }));

  /* ─── THE ONLY SOURCE OF A PAID TICKET ───
   *
   * The same trust boundary as donation settlement: the person who benefits
   * from "paid" cannot be the person who asserts it. A staff member records
   * that the ticket money was collected, and cites what they collected it
   * against — a bKash TrxID, a receipt book number, "cash, desk 2".
   *
   * ROLE: ADMIN_ROLES, matching donation settlement. Ticket money is campaign
   * money and marking it collected is a financial control, so it takes the
   * narrowest existing group rather than MODERATOR_ROLES, which the rest of
   * this module uses for event operations. If the alumni office needs desk
   * staff to take payment at the door, widen this one guard deliberately —
   * do not widen it by accident.
   */
  app.post('/api/events/registrations/:id/payment', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const { outcome, reference, amount, note } = req.body || {};

    const target = outcome === 'waived' ? 'waived'
                 : outcome === 'refunded' ? 'refunded'
                 : 'paid';

    if (target === 'paid' && (!reference || String(reference).trim().length < 3)) {
      return res.status(400).json({
        error: 'A collection reference is required to mark a ticket paid (bKash TrxID, receipt book number, or the cash desk identifier).'
      });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT * FROM event_registrations WHERE id=$1 FOR UPDATE', [id]);
      if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Registration not found' }); }
      const reg = cur.rows[0];

      // Idempotent: re-posting the same outcome is a no-op rather than a
      // second ledger movement.
      if (reg.payment_status === target) {
        await client.query('ROLLBACK');
        return res.json({ registration: reg, unchanged: true });
      }

      // Amount collected defaults to the full obligation; a partial payment
      // may be recorded explicitly. It can never exceed what is owed.
      const due = Number(reg.amount_due) || 0;
      let collected = target === 'paid' ? due : 0;
      if (target === 'paid' && amount !== undefined && amount !== null && amount !== '') {
        const asked = Number(amount);
        if (!Number.isFinite(asked) || asked < 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'amount must be a non-negative number' });
        }
        if (asked > due) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Collected amount cannot exceed the ৳${due.toLocaleString()} owed on this ticket` });
        }
        collected = asked;
      }

      /* paid_at is decided here rather than with a CASE on $2 in the statement:
       * the same parameter cannot be both assigned to a varchar column and
       * compared against a literal, because Postgres then deduces two types
       * for it and refuses to plan the statement. */
      const paidAt = target === 'paid' ? new Date() : null;

      const upd = await client.query(`
        UPDATE event_registrations
           SET payment_status=$2, amount_paid=$3,
               payment_reference=$4, paid_at=$5, payment_confirmed_by=$6
         WHERE id=$1 RETURNING *
      `, [id, target, collected,
          reference ? String(reference).trim().slice(0, 120) : null, paidAt, req.user.uid]);

      await client.query('COMMIT');

      await writeAudit('Ticket Payment Recorded',
        `ticket ${reg.ticket_code} · ${target} · ৳${collected} of ৳${due}` +
        (reference ? ` · ref "${String(reference).trim().slice(0, 120)}"` : '') +
        (note ? ` · ${String(note).slice(0, 200)}` : '') +
        ` · by user ${req.user.uid}`, target === 'paid' ? '💵' : '🧾');

      res.json({ registration: upd.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }));

  app.get('/api/events/:id/my-ticket', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(
      `SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 AND status <> 'cancelled'`,
      [parseInt(req.params.id), req.user.uid]);
    res.json(rows.rows[0] || null);
  }));

  app.post('/api/events/checkin', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const { ticketCode } = req.body || {};
    if (!ticketCode) return res.status(400).json({ error: 'ticketCode is required' });

    const found = await db.query(`
      SELECT r.*, u.full_name, ap.batch
      FROM event_registrations r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE r.ticket_code = $1
    `, [ticketCode.trim()]);

    if (!found.rows.length) return res.status(404).json({ error: 'Ticket not recognised' });
    const t = found.rows[0];
    if (t.status === 'cancelled') return res.status(409).json({ error: 'This ticket was cancelled' });
    if (t.checked_in) {
      return res.status(409).json({ error: 'Already checked in', attendee: t.full_name, at: t.checked_in_at });
    }

    const upd = await db.query(`
      UPDATE event_registrations
      SET checked_in = TRUE, checked_in_at = CURRENT_TIMESTAMP, checked_in_by = $2
      WHERE id = $1 RETURNING checked_in_at
    `, [t.id, req.user.uid]);

    await writeAudit('Attendee Checked In', `${t.full_name} · ticket ${ticketCode}`, '✅');
    res.json({ success: true, attendee: t.full_name, batch: t.batch, at: upd.rows[0].checked_in_at });
  }));
};

/* ════════════════════════════════════════════════════════════
   SCHEDULED SWEEPS

   Mounted by the compliance module at /api/cron/* behind the shared cron
   secret. Both are idempotent by construction — safe to call every five
   minutes, safe to call twice concurrently, safe to call on an empty database.
   ════════════════════════════════════════════════════════════ */

/* Moves events whose date has passed from 'upcoming' to 'past'.
 *
 * events.event_date is a VARCHAR holding a human string ('Aug 15, 2026', and
 * 'TBA' for an unscheduled event), not a DATE. The parse is done in JavaScript
 * rather than with to_date() because to_date() raises on an unparseable value
 * and would abort the whole sweep on one malformed row; Date.parse returns NaN
 * and the row is simply skipped. There are three events, so reading them all
 * costs nothing.
 *
 * 'past' — not 'completed' — is the value the client filters on
 * (features/mentorship-events.js: `e.status === 'past'`). Writing anything
 * else would hide the event from both tabs.
 */
async function sweepEventStatuses() {
  const rows = await db.query(
    `SELECT id, title, event_date FROM events WHERE status = 'upcoming'`);

  // End of the event's day, so an event does not fall off the Upcoming tab
  // while it is still running.
  const now = Date.now();
  const due = rows.rows.filter(e => {
    const t = Date.parse(e.event_date);
    return Number.isFinite(t) && (t + 86400000) < now;
  });
  if (!due.length) return { scanned: rows.rows.length, moved: 0, events: [] };

  const upd = await db.query(
    `UPDATE events SET status='past' WHERE id = ANY($1::int[]) AND status='upcoming'
     RETURNING id, title`,
    [due.map(e => e.id)]);

  for (const e of upd.rows) {
    await writeAudit('Event Closed', `"${e.title}" (event ${e.id}) moved to past by the scheduled sweep`, '📅');
  }
  return { scanned: rows.rows.length, moved: upd.rows.length, events: upd.rows };
}

/* Notifies the owner of any planner task that is overdue or falls due inside
 * the next `windowDays`.
 *
 * event_tasks.assigned_to holds a NAME typed into the planner, not a user id,
 * so the owner is resolved by matching users.full_name. An unmatched name is
 * not dropped — the reminder is broadcast to the moderator role instead, which
 * is who runs the planner, because a task nobody is reminded about is exactly
 * the failure this sweep exists to prevent.
 *
 * Idempotency is the whole difficulty here: this runs on a schedule, and a
 * naive implementation would post the same reminder every time it fires. The
 * insert is therefore conditional on no identical notification existing in the
 * last 20 hours, which gives at most one reminder per task per day however
 * often the cron runs.
 */
async function sweepTaskReminders({ windowDays = 3 } = {}) {
  const rows = await db.query(`
    SELECT t.id, t.title, t.deadline, t.status, t.assigned_to, t.committee_name,
           (SELECT u.id FROM users u
             WHERE LOWER(u.full_name) = LOWER(t.assigned_to) AND u.erased_at IS NULL
             ORDER BY u.id LIMIT 1) AS assignee_id
    FROM event_tasks t
    WHERE t.status IN ('todo','in_progress','blocked')
  `);

  const now = Date.now();
  const horizon = now + windowDays * 86400000;
  let sent = 0, unassigned = 0;

  for (const t of rows.rows) {
    const at = Date.parse(t.deadline);
    if (!Number.isFinite(at)) continue;          // 'TBA' and friends
    if (at + 86400000 > horizon) continue;        // not due yet

    const overdue = (at + 86400000) < now;
    const title = overdue ? '⏰ Task overdue' : '⏰ Task due soon';
    const subtitle = `"${t.title}" (${t.committee_name || 'General'}) — deadline ${t.deadline}.`;

    /* Every parameter is cast explicitly. Each one appears both in the SELECT
     * list, where it has no type context, and in a comparison against a typed
     * column — without the casts Postgres deduces two types for the same
     * parameter and refuses to plan the statement. */
    if (t.assignee_id) {
      const r = await db.query(`
        INSERT INTO notifications (user_id, icon, title, subtitle)
        SELECT $1::int, '⏰', $2::text, $3::text
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications
           WHERE user_id = $1::int AND title = $2::text AND subtitle = $3::text
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '20 hours')
        RETURNING id`, [t.assignee_id, title, subtitle]);
      sent += r.rowCount;
    } else {
      unassigned++;
      const r = await db.query(`
        INSERT INTO notifications (target_role, icon, title, subtitle)
        SELECT 'moderator', '⏰', $1::text, $2::text
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications
           WHERE target_role = 'moderator' AND title = $1::text AND subtitle = $2::text
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '20 hours')
        RETURNING id`, [title, `${subtitle} Assigned to "${t.assigned_to || 'nobody'}".`]);
      sent += r.rowCount;
    }
  }

  return { scanned: rows.rows.length, remindersSent: sent, unresolvedAssignees: unassigned, windowDays };
}

module.exports.sweepEventStatuses = sweepEventStatuses;
module.exports.sweepTaskReminders = sweepTaskReminders;
