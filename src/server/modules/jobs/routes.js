/* ============================================================
   DIC ALUMNI PLATFORM — JOBS

   Owns: GET/POST/PUT/DELETE /api/jobs, /api/jobs/:id/apply,
   /api/jobs/:id/applicants, /api/jobs/:id/refer.

   CRUD, applications, referrals (REQ-07).
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

module.exports = function mountJobs(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

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
};
