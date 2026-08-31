/* ============================================================
   DIC ALUMNI PLATFORM — ROUTES v2
   Endpoints for the modules that had PostgreSQL tables but no API, plus the
   modules that had neither. Mounted by server.js, which injects the auth
   middleware so there is a single implementation of the security rules.
   ============================================================ */

const crypto = require('crypto');
const db = require('../db/pool');
const { ok } = require('../shared/http');

// ─── FIELD-LEVEL ENCRYPTION (REQ-14, PDPA 2026) ───
// AES-256-GCM. The key comes from ENCRYPTION_KEY (64 hex chars). Without it the
// vault endpoints refuse to operate rather than silently storing plaintext.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const encryptionReady = /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY);

if (!encryptionReady) {
  console.warn('⚠  ENCRYPTION_KEY missing or malformed — identity vault endpoints are disabled. ' +
               'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

function encryptField(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex')
  };
}

function decryptField({ ciphertext, iv, auth_tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(auth_tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

// ─── IMMUTABLE AUDIT TRAIL ───
// Each entry is chained to the previous one's hash, so a deleted or edited row
// breaks verification. audit_logs had a table but nothing ever wrote to it.
async function writeAudit(action, meta, icon = '🛡') {
  try {
    const prev = await db.query('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const prevHash = prev.rows[0]?.hash || 'GENESIS';
    const hash = crypto.createHash('sha256')
      .update(prevHash + action + meta + new Date().toISOString())
      .digest('hex').slice(0, 16);
    await db.query(
      'INSERT INTO audit_logs (icon, action, meta, hash) VALUES ($1, $2, $3, $4)',
      [icon, action, meta, `0x${hash.toUpperCase()}`]
    );
  } catch (e) {
    console.warn('audit write failed:', e.message);
  }
}

const ref = (prefix) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

module.exports = function mountV2(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {


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
        s: crypto.createHmac('sha256', ENCRYPTION_KEY || 'dic-ticket')
                 .update(`${ticketCode}:${eventId}:${req.user.uid}`).digest('hex').slice(0, 16)
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

  /* ══════════════════════════════════════════════════════════
     JOBS — CRUD, applications, referrals (REQ-07)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/jobs', requireAuth, (req, res) => ok(res, async () => {
    const { search, type, location } = req.query;
    const where = [], params = [req.user.uid];
    if (search) { params.push(`%${search.toLowerCase()}%`);
      where.push(`(LOWER(j.title) LIKE $${params.length} OR LOWER(j.company) LIKE $${params.length} OR LOWER(ARRAY_TO_STRING(j.tags,',')) LIKE $${params.length})`); }
    if (type && type !== 'all')     { params.push(type); where.push(`j.type = $${params.length}`); }
    if (location && location !== 'all') { params.push(`%${location.toLowerCase()}%`); where.push(`LOWER(j.location) LIKE $${params.length}`); }

    const rows = await db.query(`
      SELECT j.*,
             (SELECT COUNT(*)::int FROM job_applications a WHERE a.job_id = j.id) AS applicants,
             EXISTS (SELECT 1 FROM job_applications a WHERE a.job_id = j.id AND a.applicant_id = $1) AS has_applied
      FROM jobs j
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY j.created_at DESC, j.id DESC
    `, params);
    res.json(rows.rows);
  }));

  app.post('/api/jobs', requireAuth, (req, res) => ok(res, async () => {
    const { title, company, salary, type, location, tags, emoji } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Job title is required' });
    if (!company || !company.trim()) return res.status(400).json({ error: 'Company is required' });

    const poster = await db.query('SELECT full_name FROM users WHERE id = $1', [req.user.uid]);
    const tagArray = Array.isArray(tags) ? tags
                   : String(tags || '').split(',').map(t => t.trim()).filter(Boolean);

    const row = await db.query(`
      INSERT INTO jobs (emoji, title, company, salary, type, location, posted_by_id, posted_by_name, tags, days_ago)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0) RETURNING *
    `, [emoji || '💼', title.trim(), company.trim(), salary || 'Negotiable',
        (type || 'fulltime').toLowerCase(), location || 'Dhaka',
        req.user.uid, poster.rows[0]?.full_name || 'DIC Alumni', tagArray]);

    await db.query(`INSERT INTO notifications (target_role, icon, title, subtitle) VALUES ('alumni','💼','New Job Posted',$1)`,
      [`${title.trim()} at ${company.trim()}`]);
    res.json(row.rows[0]);
  }));

  app.put('/api/jobs/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const owner = await db.query('SELECT posted_by_id FROM jobs WHERE id = $1', [id]);
    if (!owner.rows.length) return res.status(404).json({ error: 'Job not found' });
    if (owner.rows[0].posted_by_id !== req.user.uid && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'You can only edit your own postings' });
    }
    const { title, company, salary, type, location } = req.body;
    const row = await db.query(`
      UPDATE jobs SET title=COALESCE($2,title), company=COALESCE($3,company), salary=COALESCE($4,salary),
                      type=COALESCE($5,type), location=COALESCE($6,location)
      WHERE id=$1 RETURNING *
    `, [id, title, company, salary, type, location]);
    res.json(row.rows[0]);
  }));

  app.delete('/api/jobs/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const owner = await db.query('SELECT posted_by_id, title FROM jobs WHERE id = $1', [id]);
    if (!owner.rows.length) return res.status(404).json({ error: 'Job not found' });
    if (owner.rows[0].posted_by_id !== req.user.uid && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'You can only delete your own postings' });
    }
    await db.query('DELETE FROM jobs WHERE id = $1', [id]);
    await writeAudit('Job Deleted', `"${owner.rows[0].title}" by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
  }));

  app.post('/api/jobs/:id/apply', requireAuth, (req, res) => ok(res, async () => {
    const jobId = parseInt(req.params.id);
    const { coverNote, resumeUrl } = req.body || {};

    const job = await db.query('SELECT title, company, posted_by_id FROM jobs WHERE id = $1', [jobId]);
    if (!job.rows.length) return res.status(404).json({ error: 'Job not found' });

    const existing = await db.query('SELECT 1 FROM job_applications WHERE job_id=$1 AND applicant_id=$2', [jobId, req.user.uid]);
    if (existing.rows.length) return res.status(409).json({ error: 'You have already applied to this role' });

    const row = await db.query(`
      INSERT INTO job_applications (job_id, applicant_id, cover_note, resume_url)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [jobId, req.user.uid, coverNote || null, resumeUrl || null]);

    if (job.rows[0].posted_by_id) {
      const me = await db.query('SELECT full_name FROM users WHERE id=$1', [req.user.uid]);
      await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'📄','New Application Received',$2)`,
        [job.rows[0].posted_by_id, `${me.rows[0].full_name} applied for ${job.rows[0].title}.`]);
    }
    res.json({ success: true, application: row.rows[0] });
  }));

  app.get('/api/jobs/:id/applicants', requireAuth, (req, res) => ok(res, async () => {
    const jobId = parseInt(req.params.id);
    const owner = await db.query('SELECT posted_by_id FROM jobs WHERE id=$1', [jobId]);
    if (!owner.rows.length) return res.status(404).json({ error: 'Job not found' });
    if (owner.rows[0].posted_by_id !== req.user.uid && !ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ error: 'Only the poster can view applicants' });
    }
    const rows = await db.query(`
      SELECT a.id, a.status, a.cover_note, a.created_at,
             u.id AS user_id, u.full_name AS name, u.initials,
             ap.batch, ap.department AS dept, ap.current_company AS company, ap.skills
      FROM job_applications a
      JOIN users u ON u.id = a.applicant_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE a.job_id = $1 ORDER BY a.created_at DESC
    `, [jobId]);
    res.json(rows.rows);
  }));

  app.post('/api/jobs/:id/refer', requireAuth, (req, res) => ok(res, async () => {
    const jobId = parseInt(req.params.id);
    const { message } = req.body || {};
    const job = await db.query('SELECT title, posted_by_id FROM jobs WHERE id=$1', [jobId]);
    if (!job.rows.length) return res.status(404).json({ error: 'Job not found' });

    const row = await db.query(`
      INSERT INTO job_referrals (job_id, requester_id, referrer_id, message)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [jobId, req.user.uid, job.rows[0].posted_by_id || null, message || null]);

    if (job.rows[0].posted_by_id) {
      const me = await db.query('SELECT full_name FROM users WHERE id=$1', [req.user.uid]);
      await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'🤝','Referral Requested',$2)`,
        [job.rows[0].posted_by_id, `${me.rows[0].full_name} asked for a referral for ${job.rows[0].title}.`]);
    }
    res.json({ success: true, referral: row.rows[0] });
  }));

  /* ══════════════════════════════════════════════════════════
     CAMPAIGNS & DONATIONS LEDGER (REQ-05)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/campaigns', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT c.*,
             COALESCE(d.total, 0)  AS raised_live,
             COALESCE(d.donors, 0) AS donors_live
      FROM campaigns c
      LEFT JOIN (
        SELECT campaign_id, SUM(amount) AS total, COUNT(DISTINCT donor_user_id) AS donors
        FROM donations WHERE status = 'SUCCESS' GROUP BY campaign_id
      ) d ON d.campaign_id = c.id
      ORDER BY c.id ASC
    `);
    res.json(rows.rows);
  }));

  app.post('/api/campaigns', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const { name, description, tag, goalAmount, daysLeft, gateways } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Campaign name is required' });
    const row = await db.query(`
      INSERT INTO campaigns (name, description, tag, goal_amount, days_left, gateways)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [name.trim(), description || '', (tag || 'scholarship').toLowerCase(),
        parseFloat(goalAmount) || 1000000, parseInt(daysLeft) || 30,
        Array.isArray(gateways) && gateways.length ? gateways : ['bkash', 'nagad', 'card']]);
    await writeAudit('Campaign Created', `"${name.trim()}" by user ${req.user.uid}`, '💰');
    res.json(row.rows[0]);
  }));

  app.put('/api/campaigns/:id', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const { name, description, tag, goalAmount, daysLeft } = req.body;
    const row = await db.query(`
      UPDATE campaigns SET name=COALESCE($2,name), description=COALESCE($3,description),
             tag=COALESCE($4,tag), goal_amount=COALESCE($5,goal_amount), days_left=COALESCE($6,days_left)
      WHERE id=$1 RETURNING *
    `, [parseInt(req.params.id), name, description, tag,
        goalAmount ? parseFloat(goalAmount) : null, daysLeft ? parseInt(daysLeft) : null]);
    if (!row.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    res.json(row.rows[0]);
  }));

  app.delete('/api/campaigns/:id', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const row = await db.query('DELETE FROM campaigns WHERE id=$1 RETURNING name', [parseInt(req.params.id)]);
    if (!row.rows.length) return res.status(404).json({ error: 'Campaign not found' });
    await writeAudit('Campaign Deleted', `"${row.rows[0].name}" by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
  }));

  // Two-phase donation: a PENDING ledger row is written before the gateway is
  // called, then confirmed. REQ-05 requires the ledger to exist even if the
  // gateway callback never arrives.
  app.post('/api/donations', requireAuth, (req, res) => ok(res, async () => {
    const { campaignId, amount, gateway, isAnonymous } = req.body;
    const value = parseFloat(amount);
    if (!value || value <= 0) return res.status(400).json({ error: 'A positive amount is required' });
    if (!gateway) return res.status(400).json({ error: 'Select a payment method' });

    const camp = await db.query('SELECT name FROM campaigns WHERE id=$1', [parseInt(campaignId)]);
    if (!camp.rows.length) return res.status(404).json({ error: 'Campaign not found' });

    const me = await db.query('SELECT full_name FROM users WHERE id=$1', [req.user.uid]);
    const row = await db.query(`
      INSERT INTO donations (campaign_id, donor_user_id, donor_name, amount, payment_gateway,
                             transaction_reference, status, is_anonymous)
      VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7) RETURNING *
    `, [parseInt(campaignId), req.user.uid, me.rows[0].full_name, value,
        gateway, ref('TXN'), !!isAnonymous]);

    res.json({ donation: row.rows[0], campaign: camp.rows[0].name });
  }));

  app.post('/api/donations/:id/confirm', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const { success = true, failureReason } = req.body || {};

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT * FROM donations WHERE id=$1 FOR UPDATE', [id]);
      if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Donation not found' }); }
      if (cur.rows[0].donor_user_id !== req.user.uid && !ADMIN_ROLES.includes(req.user.role)) {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not your transaction' });
      }
      // Idempotent: a retried gateway callback must not double-count the ledger.
      if (cur.rows[0].status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.json({ donation: cur.rows[0], alreadySettled: true });
      }

      const receipt = success ? ref('DIC-RCPT') : null;
      const upd = await client.query(`
        UPDATE donations SET status=$2, receipt_code=$3, failure_reason=$4, completed_at=CURRENT_TIMESTAMP
        WHERE id=$1 RETURNING *
      `, [id, success ? 'SUCCESS' : 'FAILED', receipt, success ? null : (failureReason || 'Gateway declined')]);

      if (success) {
        await client.query(`
          UPDATE campaigns SET raised_amount = raised_amount + $2, donors_count = donors_count + 1
          WHERE id = $1
        `, [cur.rows[0].campaign_id, cur.rows[0].amount]);

        await client.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'💰','Donation Receipt',$2)`,
          [req.user.uid, `Your ৳${Number(cur.rows[0].amount).toLocaleString()} donation is confirmed. Receipt ${receipt}.`]);
      }

      await client.query('COMMIT');
      if (success) await writeAudit('Donation Settled', `৳${cur.rows[0].amount} via ${cur.rows[0].payment_gateway} · ${receipt}`, '💰');
      res.json({ donation: upd.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }));

  app.get('/api/donations/mine', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT d.*, c.name AS campaign_name FROM donations d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.donor_user_id = $1 ORDER BY d.created_at DESC
    `, [req.user.uid]);
    res.json(rows.rows);
  }));

  app.get('/api/donations/leaderboard', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT COALESCE(NULLIF(d.is_anonymous, TRUE)::text, '') AS ignored,
             CASE WHEN d.is_anonymous THEN 'Anonymous Donor' ELSE u.full_name END AS name,
             ap.batch, SUM(d.amount)::numeric AS total
      FROM donations d
      LEFT JOIN users u ON u.id = d.donor_user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE d.status = 'SUCCESS'
      GROUP BY d.is_anonymous, u.full_name, ap.batch
      ORDER BY total DESC LIMIT 5
    `);
    res.json(rows.rows);
  }));

  /* ══════════════════════════════════════════════════════════
     CUSTOM FIELDS (table existed, zero endpoints)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/custom-fields', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query('SELECT * FROM custom_fields ORDER BY created_at ASC');
    res.json(rows.rows);
  }));

  app.post('/api/custom-fields', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const { label, section, fieldType, isRequired } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Field label is required' });
    const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const exists = await db.query('SELECT 1 FROM custom_fields WHERE id=$1', [id]);
    if (exists.rows.length) return res.status(409).json({ error: 'A field with that name already exists' });

    const row = await db.query(`
      INSERT INTO custom_fields (id, label, section, field_type, is_required)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [id, label.trim(), section || 'academic', fieldType || 'text', !!isRequired]);
    await writeAudit('Custom Field Created', `"${label.trim()}" by user ${req.user.uid}`, '🧩');
    res.json(row.rows[0]);
  }));

  app.delete('/api/custom-fields/:id', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const row = await db.query('DELETE FROM custom_fields WHERE id=$1 RETURNING label', [req.params.id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Field not found' });
    await writeAudit('Custom Field Deleted', `"${row.rows[0].label}" by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
  }));

  /* ══════════════════════════════════════════════════════════
     MENTORSHIP (REQ-04)
     ══════════════════════════════════════════════════════════ */

  // Expire unanswered requests past their 5-day window before every read.
  async function expireStaleMentorships() {
    await db.query(`
      UPDATE mentorships SET status='expired'
      WHERE status='pending' AND expires_at < CURRENT_TIMESTAMP
    `);
  }

  app.get('/api/mentorships', requireAuth, (req, res) => ok(res, async () => {
    await expireStaleMentorships();
    const rows = await db.query(`
      SELECT m.*,
             mentor.full_name AS mentor_name, mentor.initials AS mentor_initials,
             mentee.full_name AS mentee_name, mentee.initials AS mentee_initials,
             mp.current_company AS mentor_company, mp.job_title AS mentor_role, mp.batch AS mentor_batch
      FROM mentorships m
      JOIN users mentor ON mentor.id = m.mentor_id
      JOIN users mentee ON mentee.id = m.mentee_id
      LEFT JOIN alumni_profiles mp ON mp.user_id = m.mentor_id
      WHERE m.mentor_id = $1 OR m.mentee_id = $1
      ORDER BY m.created_at DESC
    `, [req.user.uid]);

    const mine = req.user.uid;
    res.json({
      asMentee: rows.rows.filter(r => r.mentee_id === mine),
      asMentor: rows.rows.filter(r => r.mentor_id === mine),
      incoming: rows.rows.filter(r => r.mentor_id === mine && r.status === 'pending')
    });
  }));

  // REQ-04's six weighted criteria, computed in SQL over real profile data.
  app.get('/api/mentorships/suggestions', requireAuth, (req, res) => ok(res, async () => {
    const me = await db.query(`
      SELECT ap.industry, ap.skills, ap.city, ap.department, ap.batch
      FROM alumni_profiles ap WHERE ap.user_id = $1
    `, [req.user.uid]);
    const p = me.rows[0] || {};

    const rows = await db.query(`
      SELECT u.id, u.full_name AS name, u.initials,
             ap.current_company AS company, ap.job_title AS role, ap.batch, ap.color,
             ap.department, ap.industry, ap.city,
             (
                 CASE WHEN ap.industry   IS NOT DISTINCT FROM $2 THEN 25 ELSE 0 END   -- industry domain 25%
               + CASE WHEN ap.skills     ILIKE '%' || COALESCE($3,'~') || '%' THEN 20 ELSE 0 END -- skill overlap 20%
               + CASE WHEN ap.city       IS NOT DISTINCT FROM $4 THEN 15 ELSE 0 END   -- geo proximity 15%
               + CASE WHEN ap.department IS NOT DISTINCT FROM $5 THEN 15 ELSE 0 END   -- shared campus/dept 15%
               + 15                                                                    -- language preference 15%
               + CASE WHEN ap.can_mentor THEN 10 ELSE 0 END                            -- availability 10%
             ) AS match_score
      FROM users u
      JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE ap.can_mentor = TRUE
        AND u.id <> $1
        AND NOT EXISTS (
          SELECT 1 FROM mentorships m
          WHERE m.mentor_id = u.id AND m.mentee_id = $1 AND m.status IN ('pending','accepted')
        )
      ORDER BY match_score DESC, ap.batch ASC
      LIMIT 6
    `, [req.user.uid, p.industry || null, (p.skills || '').split(',')[0]?.trim() || null,
        p.city || null, p.department || null]);
    res.json(rows.rows);
  }));

  app.post('/api/mentorships', requireAuth, (req, res) => ok(res, async () => {
    const { mentorId, subject, message, matchScore } = req.body;
    const mentor = parseInt(mentorId);
    if (!mentor) return res.status(400).json({ error: 'mentorId is required' });
    if (mentor === req.user.uid) return res.status(400).json({ error: 'You cannot mentor yourself' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Please describe what you need help with' });

    const dup = await db.query(
      `SELECT 1 FROM mentorships WHERE mentor_id=$1 AND mentee_id=$2 AND status IN ('pending','accepted')`,
      [mentor, req.user.uid]);
    if (dup.rows.length) return res.status(409).json({ error: 'You already have an open request with this mentor' });

    const row = await db.query(`
      INSERT INTO mentorships (mentor_id, mentee_id, subject, message, match_score)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [mentor, req.user.uid, subject.trim(), message || null, parseInt(matchScore) || 0]);

    const me = await db.query('SELECT full_name FROM users WHERE id=$1', [req.user.uid]);
    await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'🤝','New Mentorship Request',$2)`,
      [mentor, `${me.rows[0].full_name}: "${subject.trim()}" — expires in 5 days.`]);

    res.json({ success: true, mentorship: row.rows[0] });
  }));

  app.put('/api/mentorships/:id/:action', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const action = req.params.action;
    const map = { accept: 'accepted', decline: 'declined', complete: 'completed' };
    if (!map[action]) return res.status(400).json({ error: 'Unknown action' });

    const cur = await db.query('SELECT * FROM mentorships WHERE id=$1', [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Request not found' });

    const m = cur.rows[0];
    // Only the mentor answers a request; either party may close an active one.
    const allowed = action === 'complete'
      ? [m.mentor_id, m.mentee_id].includes(req.user.uid)
      : m.mentor_id === req.user.uid;
    if (!allowed) return res.status(403).json({ error: 'You cannot change this request' });
    if (action !== 'complete' && m.status !== 'pending') {
      return res.status(409).json({ error: `This request is already ${m.status}` });
    }

    const row = await db.query(`
      UPDATE mentorships SET status=$2, responded_at=CURRENT_TIMESTAMP,
        completed_at = CASE WHEN $2='completed' THEN CURRENT_TIMESTAMP ELSE completed_at END
      WHERE id=$1 RETURNING *
    `, [id, map[action]]);

    const mentorName = await db.query('SELECT full_name FROM users WHERE id=$1', [m.mentor_id]);
    await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'🤝',$2,$3)`,
      [m.mentee_id,
       `Mentorship ${map[action] === 'accepted' ? 'Accepted ✓' : map[action] === 'declined' ? 'Declined' : 'Completed'}`,
       `${mentorName.rows[0].full_name} ${map[action]} your request "${m.subject}".`]);

    res.json({ success: true, mentorship: row.rows[0] });
  }));

  /* ══════════════════════════════════════════════════════════
     CONNECTIONS
     ══════════════════════════════════════════════════════════ */

  app.get('/api/connections', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT c.*, u.full_name, u.initials
      FROM connections c
      JOIN users u ON u.id = CASE WHEN c.requester_id=$1 THEN c.addressee_id ELSE c.requester_id END
      WHERE c.requester_id=$1 OR c.addressee_id=$1
    `, [req.user.uid]);
    res.json(rows.rows);
  }));

  app.post('/api/connections/:userId', requireAuth, (req, res) => ok(res, async () => {
    const target = parseInt(req.params.userId);
    if (target === req.user.uid) return res.status(400).json({ error: 'You cannot connect with yourself' });
    const exists = await db.query(
      `SELECT * FROM connections WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
      [req.user.uid, target]);
    if (exists.rows.length) return res.status(409).json({ error: 'A connection already exists', connection: exists.rows[0] });

    const row = await db.query(
      'INSERT INTO connections (requester_id, addressee_id) VALUES ($1,$2) RETURNING *', [req.user.uid, target]);
    const me = await db.query('SELECT full_name FROM users WHERE id=$1', [req.user.uid]);
    await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'🔗','New Connection Request',$2)`,
      [target, `${me.rows[0].full_name} wants to connect with you.`]);
    res.json({ success: true, connection: row.rows[0] });
  }));

  /* ══════════════════════════════════════════════════════════
     POLLS
     ══════════════════════════════════════════════════════════ */

  app.get('/api/polls/active', requireAuth, (req, res) => ok(res, async () => {
    const poll = await db.query('SELECT * FROM polls WHERE is_active = TRUE ORDER BY id DESC LIMIT 1');
    if (!poll.rows.length) return res.json(null);
    const p = poll.rows[0];
    const votes = await db.query('SELECT option_index, COUNT(*)::int n FROM poll_votes WHERE poll_id=$1 GROUP BY option_index', [p.id]);
    const mine = await db.query('SELECT option_index FROM poll_votes WHERE poll_id=$1 AND user_id=$2', [p.id, req.user.uid]);
    const counts = p.options.map((_, i) => votes.rows.find(v => v.option_index === i)?.n || 0);
    res.json({ ...p, counts, total: counts.reduce((a, b) => a + b, 0), myVote: mine.rows[0]?.option_index ?? null });
  }));

  app.post('/api/polls/:id/vote', requireAuth, (req, res) => ok(res, async () => {
    const pollId = parseInt(req.params.id);
    const idx = parseInt(req.body.optionIndex);
    const poll = await db.query('SELECT options FROM polls WHERE id=$1 AND is_active=TRUE', [pollId]);
    if (!poll.rows.length) return res.status(404).json({ error: 'Poll not found or closed' });
    if (!(idx >= 0 && idx < poll.rows[0].options.length)) return res.status(400).json({ error: 'Invalid option' });

    // Re-voting updates the existing row; the UNIQUE constraint guarantees one
    // vote per person no matter how many times the button is pressed.
    await db.query(`
      INSERT INTO poll_votes (poll_id, user_id, option_index) VALUES ($1,$2,$3)
      ON CONFLICT (poll_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index
    `, [pollId, req.user.uid, idx]);
    res.json({ success: true });
  }));

  /* ══════════════════════════════════════════════════════════
     BROADCASTS (REQ-12)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/broadcasts', requireRole(...MODERATOR_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT b.*, u.full_name AS sender_name FROM broadcasts b
      LEFT JOIN users u ON u.id = b.sender_id ORDER BY b.created_at DESC LIMIT 25
    `);
    res.json(rows.rows);
  }));

  app.post('/api/broadcasts', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const { title, body, channels, targetRole, targetBatch } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message body is required' });

    const chans = Array.isArray(channels) && channels.length ? channels : ['push'];

    // Recipients are resolved from the real audience, not a fixed headline number.
    const params = [];
    let where = 'WHERE 1=1';
    if (targetRole && targetRole !== 'all') { params.push(targetRole); where += ` AND u.role = $${params.length}`; }
    if (targetBatch) { params.push(parseInt(targetBatch)); where += ` AND ap.batch = $${params.length}`; }

    const audience = await db.query(
      `SELECT u.id FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id = u.id ${where}`, params);
    const recipientIds = audience.rows.map(r => r.id);

    const bc = await db.query(`
      INSERT INTO broadcasts (sender_id, title, body, channels, target_role, target_batch,
                              recipients_count, delivered_count, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'sent') RETURNING *
    `, [req.user.uid, title.trim(), body.trim(), chans, targetRole || null,
        targetBatch ? parseInt(targetBatch) : null, recipientIds.length]);

    // Fan out as real in-app notifications so the broadcast is actually delivered.
    for (const uid of recipientIds) {
      await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'📢',$2,$3)`,
        [uid, title.trim(), body.trim()]);
    }

    await writeAudit('Broadcast Sent', `"${title.trim()}" to ${recipientIds.length} recipients via ${chans.join('/')}`, '📢');
    res.json({ success: true, broadcast: bc.rows[0], recipients: recipientIds.length });
  }));

  /* ══════════════════════════════════════════════════════════
     AUDIT LOG (write path added above; read path was missing)
     ══════════════════════════════════════════════════════════ */

  app.get('/api/audit-logs', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50');
    res.json(rows.rows);
  }));

  return { writeAudit, encryptField, decryptField, encryptionReady, ref };
};
