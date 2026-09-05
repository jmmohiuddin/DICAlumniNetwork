/* ============================================================
   DIC ALUMNI PLATFORM — GIVING (CAMPAIGNS & DONATIONS)

   Owns: GET/POST/PUT/DELETE /api/campaigns, POST /api/donations,
   POST /api/donations/:id/confirm, GET /api/donations/mine,
   GET /api/donations/leaderboard.

   Campaigns & donations ledger (REQ-05).
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

  // Two-phase donation: a PENDING ledger row is written before the gateway is
  // called, then confirmed. REQ-05 requires the ledger to exist even if the
  // gateway callback never arrives.
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

    res.json({ donation: row.rows[0], campaign: camp.rows[0].name });
  }));

  /* ─── THE ONLY SOURCE OF A 'SUCCESS' DONATION ───
   *
   * No payment provider is integrated in this codebase, so nothing here can
   * prove that money moved. Until one is wired in, this returns null and every
   * donation stays PENDING. That is deliberate: a PENDING ledger row that is
   * later reconciled is recoverable, a SUCCESS row that no one paid for is not.
   *
   * TODO(payments): wire the real verification here. It must be a
   * server-to-server call the client cannot influence — bKash
   * /tokenized/checkout/execute, Nagad's payment-verify, the card PSP's capture
   * lookup — keyed on the provider's OWN reference, and it must confirm both
   * that the payment settled AND that the settled amount and currency match
   * this donation row. Return null on anything else, including a mismatch.
   * The same function is what a provider webhook handler should call, after
   * validating the webhook signature.
   */
  // eslint-disable-next-line no-unused-vars
  async function verifyGatewayPayment(donation, providerReference) {
    return null;
  }

  app.post('/api/donations/:id/confirm', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    const body = req.body || {};
    // A client may report a FAILURE — it cannot profit from one — but never a
    // success. `success` used to be read from the body and defaulted to true,
    // so any authenticated user could POST here and mint a SUCCESS donation,
    // a receipt code and campaign credit without paying. `success: true` is
    // now ignored; only verifyGatewayPayment() can produce a SUCCESS state.
    const clientReportedFailure = body.success === false || body.failed === true;

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

      const verified = clientReportedFailure
        ? null
        : await verifyGatewayPayment(cur.rows[0], body.providerReference);

      if (!clientReportedFailure && !verified) {
        // Nothing server-side attests that this was paid, so the ledger row is
        // left exactly as it is. The response shape is unchanged; the flag
        // tells the client the settlement is still outstanding.
        await client.query('ROLLBACK');
        return res.json({ donation: cur.rows[0], pendingVerification: true });
      }

      const success = !!verified;
      const receipt = success ? ref('DIC-RCPT') : null;
      const upd = await client.query(`
        UPDATE donations SET status=$2, receipt_code=$3, failure_reason=$4, completed_at=CURRENT_TIMESTAMP
        WHERE id=$1 RETURNING *
      `, [id, success ? 'SUCCESS' : 'FAILED', receipt, success ? null : (body.failureReason || 'Gateway declined')]);

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
