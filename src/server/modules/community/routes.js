/* ============================================================
   DIC ALUMNI PLATFORM — COMMUNITY (CONNECTIONS, POLLS, BROADCASTS)

   Owns: GET/POST /api/connections, /api/connections/:userId,
   GET /api/polls/active, POST /api/polls/:id/vote,
   GET/POST /api/broadcasts (REQ-12).
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

module.exports = function mountCommunity(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

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
};
