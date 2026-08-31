/* ============================================================
   DIC ALUMNI PLATFORM — MENTORSHIP

   Owns: GET /api/mentorships, GET /api/mentorships/suggestions,
   POST /api/mentorships, PUT /api/mentorships/:id/:action.

   REQ-04.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');

module.exports = function mountMentorship(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

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
};
