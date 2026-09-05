/* ============================================================
   DIC ALUMNI PLATFORM — GIVING (CAMPAIGNS & DONATIONS)

   Owns: GET/POST/PUT/DELETE /api/campaigns, POST /api/donations,
   POST /api/donations/:id/confirm, POST /api/donations/:id/settle,
   GET /api/donations/pending, GET /api/donations/mine,
   GET /api/donations/leaderboard.

   Campaigns & donations ledger (REQ-05).

   ─── PLEDGE / MANUAL RECONCILIATION ───
   There is no payment gateway in this application. package.json carries four
   runtime dependencies — express, pg, cors, body-parser — and none of them
   talks to bKash, Nagad or a card processor. Nothing in this process can
   observe that money moved.

   The honest model, and the one implemented here, is therefore a pledge book
   rather than a payment page. A donor records an INTENT to give (a PENDING
   ledger row); money arrives out of band — bKash send-money, a bank transfer,
   cash at the alumni office; a member of staff with finance authority matches
   the incoming payment to the pledge and settles it, recording the real-world
   transaction reference they matched against. Only that staff action can
   produce a SUCCESS row.

   PENDING is deliberately reused as the pledge state instead of adding a
   PLEDGED value to the status CHECK. PENDING already means exactly this —
   recorded, not settled — and reusing it keeps the constraint, the indexes and
   every existing client-side status branch working unchanged.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');
const { ref } = require('../../shared/reference');

/* Upper bound on a single donation, in BDT (৳1 crore). Without one, an
   authenticated user could post an arbitrarily large amount and drive
   campaigns.raised_amount — NUMERIC(12,2), max ৳9,999,999,999.99 — to an
   arithmetic extreme or an overflow error. Anything genuinely larger is a
   pledge that belongs in a manual, reconciled process, not a self-service form. */
const MAX_DONATION_AMOUNT = 10000000;

module.exports = function mountGiving(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

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

  // Records a PLEDGE. The row is written PENDING and stays PENDING until a
  // finance-capable staff member settles it against a real transaction — see
  // POST /api/donations/:id/settle. REQ-05 requires the ledger row to exist
  // from the moment of the commitment, which is what this writes.
  app.post('/api/donations', requireAuth, (req, res) => ok(res, async () => {
    const { campaignId, amount, gateway, isAnonymous } = req.body;
    // parseFloat() let '12abc' through as 12 and '1e999' through as Infinity,
    // and the amount had no ceiling. Accept only a finite number inside the
    // ledger's range.
    const value = (typeof amount === 'number' || typeof amount === 'string') ? Number(amount) : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: 'A positive amount is required' });
    }
    if (value > MAX_DONATION_AMOUNT) {
      return res.status(400).json({
        error: `A single donation cannot exceed ৳${MAX_DONATION_AMOUNT.toLocaleString()}. Contact the alumni office for larger gifts.`
      });
    }
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

    await writeAudit('Donation Pledged',
      `৳${value} to "${camp.rows[0].name}" by user ${req.user.uid} · ${row.rows[0].transaction_reference}`, '🤝');

    // `pledge: true` tells the client this is a commitment, not a completed
    // payment, so the UI can say so instead of showing a receipt.
    res.json({ donation: row.rows[0], campaign: camp.rows[0].name, pledge: true });
  }));

  /* ─── THE DONOR'S HALF: A PLEDGE MAY ONLY BE WITHDRAWN ───
   *
   * This endpoint used to read a `success` boolean out of the request body and
   * default it to TRUE, so any authenticated user could POST here and mint
   * themselves a SUCCESS donation of any amount, a receipt code and campaign
   * credit, with no money changing hands. That was the single worst finding in
   * the audit.
   *
   * The trust boundary is the whole issue: the caller is the party who
   * benefits from the answer, so the caller's answer cannot be the evidence.
   * A donor may still tell us they are NOT going to pay — nobody profits from
   * withdrawing their own pledge — and that path is kept, because a pledge
   * book full of abandoned rows is worse than one that can be tidied.
   *
   * `success: true` is ignored. There is no code path from this endpoint to
   * SUCCESS. Settlement lives in POST /api/donations/:id/settle, behind a role.
   */
  app.post('/api/donations/:id/confirm', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const body = req.body || {};
    const withdrawing = body.success === false || body.failed === true;

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query('SELECT * FROM donations WHERE id=$1 FOR UPDATE', [id]);
      if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Donation not found' }); }
      if (cur.rows[0].donor_user_id !== req.user.uid && !ADMIN_ROLES.includes(req.user.role)) {
        await client.query('ROLLBACK'); return res.status(403).json({ error: 'Not your transaction' });
      }
      // Idempotent: a retried call must not re-run the state transition.
      if (cur.rows[0].status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.json({ donation: cur.rows[0], alreadySettled: true });
      }

      if (!withdrawing) {
        // The pledge stands. Nothing server-side attests that money arrived,
        // so the row is left exactly as it is. The response shape is unchanged
        // and `pendingVerification` still tells the client settlement is
        // outstanding; `pledge` names what the row actually is.
        await client.query('ROLLBACK');
        return res.json({ donation: cur.rows[0], pendingVerification: true, pledge: true });
      }

      const upd = await client.query(`
        UPDATE donations SET status='FAILED', failure_reason=$2, completed_at=CURRENT_TIMESTAMP
        WHERE id=$1 RETURNING *
      `, [id, String(body.failureReason || 'Withdrawn by donor').slice(0, 500)]);

      await client.query('COMMIT');
      await writeAudit('Pledge Withdrawn',
        `৳${cur.rows[0].amount} · ${cur.rows[0].transaction_reference} by user ${req.user.uid}`, '↩');
      res.json({ donation: upd.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }));

  /* ─── THE ONLY SOURCE OF A 'SUCCESS' DONATION ───
   *
   * A human with finance authority states that the money arrived and cites the
   * real-world transaction it arrived under. That citation is the point: a
   * SUCCESS row is only worth anything if someone can later hold it against a
   * bank statement or a bKash export, so settlement_reference is mandatory and
   * settled_by records who made the claim.
   *
   * ROLE: ADMIN_ROLES — super_admin and univ_admin. This platform has no
   * Finance Officer role (users.role is CHECK-constrained to alumni,
   * moderator, dept_admin, univ_admin, super_admin), and the two roles below
   * univ_admin are content moderation roles held by many more people. Crediting
   * a campaign with money is a financial control, so it takes the narrowest
   * existing group that can plausibly do the job. If a real finance role is
   * added later, this is the one line to change.
   */
  app.post('/api/donations/:id/settle', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const { reference, method, note, outcome } = req.body || {};

    // 'received' credits the campaign; 'failed' closes an uncollectable pledge.
    const settleTo = outcome === 'failed' ? 'FAILED' : 'SUCCESS';

    if (settleTo === 'SUCCESS' && (!reference || !String(reference).trim())) {
      return res.status(400).json({
        error: 'A real-world transaction reference is required to mark a pledge received (bKash TrxID, bank slip number, receipt book number).'
      });
    }
    const txnRef = String(reference || '').trim().slice(0, 120);
    if (settleTo === 'SUCCESS' && txnRef.length < 4) {
      return res.status(400).json({ error: 'The transaction reference is too short to identify a payment' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Row-locked, exactly as the old two-phase settlement was: two admins
      // clicking "received" at once must not credit the campaign twice.
      const cur = await client.query('SELECT * FROM donations WHERE id=$1 FOR UPDATE', [id]);
      if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Donation not found' }); }

      if (cur.rows[0].status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.json({ donation: cur.rows[0], alreadySettled: true });
      }

      const donation = cur.rows[0];
      const success = settleTo === 'SUCCESS';
      const receipt = success ? ref('DIC-RCPT') : null;

      const upd = await client.query(`
        UPDATE donations
           SET status=$2, receipt_code=$3, failure_reason=$4,
               settled_by=$5, settlement_reference=$6, settlement_method=$7,
               settlement_note=$8, settled_at=CURRENT_TIMESTAMP,
               completed_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING *
      `, [id, settleTo, receipt,
          success ? null : String(note || 'Pledge not collected').slice(0, 500),
          req.user.uid, txnRef || null,
          String(method || donation.payment_gateway || '').slice(0, 40) || null,
          note ? String(note).slice(0, 2000) : null]);

      if (success) {
        await client.query(`
          UPDATE campaigns SET raised_amount = raised_amount + $2, donors_count = donors_count + 1
          WHERE id = $1
        `, [donation.campaign_id, donation.amount]);

        if (donation.donor_user_id) {
          await client.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'💰','Donation Receipt',$2)`,
            [donation.donor_user_id,
             `Your ৳${Number(donation.amount).toLocaleString()} gift has been received and confirmed. Receipt ${receipt}.`]);
        }
      }

      await client.query('COMMIT');

      await writeAudit(success ? 'Donation Settled' : 'Pledge Closed Unpaid',
        `৳${donation.amount} · pledge ${donation.transaction_reference}` +
        (success ? ` · matched to "${txnRef}" · receipt ${receipt}` : '') +
        ` · confirmed by user ${req.user.uid}`, success ? '💰' : '🚫');

      res.json({ donation: upd.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  }));

  /* The reconciliation queue: outstanding pledges, oldest first, so whoever is
   * matching the bank statement has a worklist. */
  app.get('/api/donations/pending', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT d.id, d.amount, d.currency, d.payment_gateway, d.transaction_reference,
             d.is_anonymous, d.created_at,
             CASE WHEN d.is_anonymous THEN 'Anonymous Donor' ELSE d.donor_name END AS donor_name,
             d.donor_user_id, c.name AS campaign_name
      FROM donations d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.status = 'PENDING'
      ORDER BY d.created_at ASC
      LIMIT 200
    `);
    res.json(rows.rows);
  }));

  app.get('/api/donations/mine', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT d.*, c.name AS campaign_name FROM donations d
      LEFT JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.donor_user_id = $1 ORDER BY d.created_at DESC
    `, [req.user.uid]);
    res.json(rows.rows);
  }));

  // An anonymous donor gets a row with an amount and nothing else. The batch
  // used to be selected unconditionally, so "Anonymous Donor · Batch 2016"
  // narrowed the donor to a handful of people — anonymity the donor asked for
  // and did not get. Grouping is by donor id rather than by name so two
  // alumni who share a name are not merged into one entry.
  app.get('/api/donations/leaderboard', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT COALESCE(NULLIF(d.is_anonymous, TRUE)::text, '') AS ignored,
             CASE WHEN d.is_anonymous THEN 'Anonymous Donor' ELSE u.full_name END AS name,
             CASE WHEN d.is_anonymous THEN NULL ELSE ap.batch END AS batch,
             SUM(d.amount)::numeric AS total
      FROM donations d
      LEFT JOIN users u ON u.id = d.donor_user_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE d.status = 'SUCCESS'
      GROUP BY d.is_anonymous, d.donor_user_id, u.full_name, ap.batch
      ORDER BY total DESC LIMIT 5
    `);
    res.json(rows.rows);
  }));
};
