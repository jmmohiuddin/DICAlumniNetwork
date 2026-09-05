/* ============================================================
   DIC ALUMNI PLATFORM — EVENTS

   Owns: GET/POST/PUT/DELETE /api/events, /api/events/:id/register,
   /api/events/:id/attendees, /api/events/:id/my-ticket, /api/events/checkin.

   Full CRUD (table existed, zero endpoints) plus ticketing, registration
   and check-in (REQ-06).
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

      const priceValue = parseFloat(String(event.price).replace(/[^\d.]/g, '')) || 0;

      const reg = await client.query(`
        INSERT INTO event_registrations
          (event_id, user_id, ticket_code, qr_payload, amount_paid, payment_gateway, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
      `, [eventId, req.user.uid, ticketCode, qrPayload, priceValue, paymentGateway || null, status]);

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
            ? `Your ticket for "${event.title}" is ${ticketCode}.`
            : `"${event.title}" is at capacity — you are on the waitlist.`]);

      await client.query('COMMIT');
      res.json({ registration: reg.rows[0], status, event: event.title });
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
      SELECT r.id, r.ticket_code, r.status, r.checked_in, r.checked_in_at, r.amount_paid,
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
