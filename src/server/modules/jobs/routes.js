/* ============================================================
   DIC ALUMNI PLATFORM — JOBS

   Owns: GET/POST/PUT/DELETE /api/jobs, /api/jobs/:id/apply,
   /api/jobs/:id/applicants, /api/jobs/:id/refer,
   POST /api/resumes, GET /api/resumes/mine, GET/DELETE /api/resumes/:id.

   CRUD, applications, referrals, resume upload (REQ-07).
   ============================================================ */

const crypto = require('crypto');
const bodyParser = require('body-parser');
const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

/* ════════════════════════════════════════════════════════════
   RESUME UPLOAD (REQ-07)

   'resume' was a plain URL text field. There was no file upload anywhere on
   the platform, so REQ-07's "upload and parse a resume" had nothing to parse
   and nothing to upload.

   ─── WHY THE FILE LIVES IN POSTGRES ───
   The deployment target is Vercel serverless, where the filesystem is
   ephemeral: a file written to disk during one invocation is not there for the
   next, so /uploads is not a store, it is a leak. Object storage would need an
   SDK, and this project's four runtime dependencies (express, pg, cors,
   body-parser) are frozen — no multer, no @aws-sdk/client-s3. That leaves the
   database, which is durable, already connected, and already backed up. bytea
   with a hard size cap is the honest answer at this scale.

   ─── WHY THE DECLARED TYPE IS NOT TRUSTED ───
   Content-Type and the file extension are both attacker-chosen strings. The
   type is decided by reading the file's magic bytes, and only three formats
   are accepted. Anything else is rejected — including, deliberately, images,
   archives and HTML.

   ─── WHY DOWNLOAD SERVES A TYPE WE CHOSE ───
   Echoing a stored content type back on download is how an "upload a resume"
   feature becomes stored XSS: upload text/html, send someone the link, and the
   browser renders your script on the platform's own origin. The download route
   emits a Content-Type from the constant table below, keyed by the type the
   magic-byte check determined, plus Content-Disposition: attachment and
   X-Content-Type-Options: nosniff.
   ════════════════════════════════════════════════════════════ */

/* 1 MB. Small on purpose: a large part of this user base is on 2G/3G, where
   a 5 MB upload is a multi-minute transfer that will usually fail. A resume
   that does not fit in 1 MB is a resume with uncompressed images in it. */
const RESUME_MAX_BYTES = 1024 * 1024;

/* The allowlist. Both the accepted formats and the exact Content-Type the
   download route is permitted to emit — the values here never come from the
   uploader. */
const RESUME_TYPES = {
  pdf:  { mime: 'application/pdf', ext: '.pdf' },
  doc:  { mime: 'application/msword', ext: '.doc' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' }
};

const OLE2_MAGIC = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
const DOCX_MARKER = Buffer.from('word/document.xml');

/** The format's key in RESUME_TYPES, from the bytes alone, or null. */
function detectResumeType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.subarray(0, 8).equals(OLE2_MAGIC)) return 'doc';
  if (buf.subarray(0, 4).equals(ZIP_MAGIC)) {
    /* Every OOXML file is a zip, as are .odt, .xlsx, .jar and a plain archive,
       so the zip magic alone proves nothing. A .docx must contain an entry
       named word/document.xml, and zip entry NAMES are stored uncompressed in
       the local file headers, so the literal is findable in the raw bytes. */
    return buf.includes(DOCX_MARKER) ? 'docx' : null;
  }
  return null;
}

/* A filename goes into a Content-Disposition header, so a stray quote, CR or
   LF in it is a header-injection primitive. Everything outside a conservative
   set is dropped rather than escaped, and the extension is replaced with the
   one belonging to the format we actually detected — a .pdf that is really a
   .doc gets named .doc. */
function safeFilename(raw, typeKey) {
  const base = String(raw || 'resume')
    .replace(/[\\/]/g, ' ')            // no path components
    .replace(/\.[A-Za-z0-9]{1,8}$/, '') // drop the claimed extension
    .replace(/[^A-Za-z0-9 ._-]/g, '')   // ASCII only; no quotes, CR, LF
    .trim()
    .slice(0, 80);
  return `${base || 'resume'}${RESUME_TYPES[typeKey].ext}`;
}

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
    const { coverNote, resumeUrl, resumeFileId } = req.body || {};

    const job = await db.query('SELECT title, company, posted_by_id FROM jobs WHERE id = $1', [jobId]);
    if (!job.rows.length) return res.status(404).json({ error: 'Job not found' });

    const existing = await db.query('SELECT 1 FROM job_applications WHERE job_id=$1 AND applicant_id=$2', [jobId, req.user.uid]);
    if (existing.rows.length) return res.status(409).json({ error: 'You have already applied to this role' });

    /* An attached file must be one the applicant owns. Without this check the
       id is a reference to any row in the table, so attaching someone else's
       resume — and then reading it back through the poster's applicants view —
       would be a one-parameter data leak. */
    let fileId = null;
    if (resumeFileId !== undefined && resumeFileId !== null && resumeFileId !== '') {
      const owned = await db.query('SELECT id FROM resume_files WHERE id=$1 AND user_id=$2',
        [parseInt(resumeFileId), req.user.uid]);
      if (!owned.rows.length) return res.status(404).json({ error: 'Resume file not found' });
      fileId = owned.rows[0].id;
    }

    const row = await db.query(`
      INSERT INTO job_applications (job_id, applicant_id, cover_note, resume_url, resume_file_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [jobId, req.user.uid, coverNote || null, resumeUrl || null, fileId]);

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
    // resume_files.content is deliberately not selected: the metadata is what
    // the list needs, and pulling megabytes of bytea per applicant into memory
    // to render a table is how this endpoint would fall over.
    const rows = await db.query(`
      SELECT a.id, a.status, a.cover_note, a.created_at, a.resume_url,
             a.resume_file_id, rf.filename AS resume_filename,
             rf.content_type AS resume_content_type, rf.byte_size AS resume_bytes,
             u.id AS user_id, u.full_name AS name, u.initials,
             ap.batch, ap.department AS dept, ap.current_company AS company, ap.skills
      FROM job_applications a
      JOIN users u ON u.id = a.applicant_id
      LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      LEFT JOIN resume_files rf ON rf.id = a.resume_file_id
      WHERE a.job_id = $1 ORDER BY a.created_at DESC
    `, [jobId]);
    res.json(rows.rows);
  }));

  /* ─── RESUME UPLOAD ───
   *
   * The body is raw bytes, not multipart: parsing multipart/form-data by hand
   * is exactly the kind of thing that goes wrong, and multer cannot be added.
   * The client sends the file as the request body with the file's own
   * Content-Type (or application/octet-stream) and the name in X-Filename.
   *
   * The global bodyParser.json() in server.js only claims application/json, so
   * it passes a binary body through untouched and this route-scoped raw parser
   * receives the stream. Its 1 MB limit is enforced by body-parser itself —
   * the request is aborted before a large body is buffered, rather than after.
   */
  const resumeBody = (req, res, next) =>
    bodyParser.raw({ type: () => true, limit: RESUME_MAX_BYTES })(req, res, (err) => {
      if (!err) return next();
      if (err.type === 'entity.too.large') {
        return res.status(413).json({
          error: `Resume files must be ${Math.round(RESUME_MAX_BYTES / 1024)} KB or smaller.`
        });
      }
      return res.status(400).json({ error: 'The uploaded file could not be read' });
    });

  app.post('/api/resumes', requireAuth, resumeBody, (req, res) => ok(res, async () => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({
        error: 'Send the file as the raw request body with its own Content-Type (not application/json).'
      });
    }
    if (buf.length > RESUME_MAX_BYTES) {
      return res.status(413).json({ error: `Resume files must be ${Math.round(RESUME_MAX_BYTES / 1024)} KB or smaller.` });
    }

    // The declared Content-Type and the extension are both ignored here; only
    // the bytes decide.
    const typeKey = detectResumeType(buf);
    if (!typeKey) {
      return res.status(415).json({
        error: 'Only PDF, DOC and DOCX files are accepted. The file\'s contents did not match any of those formats.'
      });
    }

    const filename = safeFilename(req.headers['x-filename'] || req.query.filename, typeKey);
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

    const row = await db.query(`
      INSERT INTO resume_files (user_id, filename, content_type, byte_size, sha256, content)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, filename, content_type, byte_size, sha256, created_at
    `, [req.user.uid, filename, RESUME_TYPES[typeKey].mime, buf.length, sha256, buf]);

    await writeAudit('Resume Uploaded',
      `${filename} (${typeKey}, ${buf.length} bytes, sha256 ${sha256.slice(0, 16)}…) by user ${req.user.uid}`, '📄');

    res.json({ success: true, resume: row.rows[0] });
  }));

  app.get('/api/resumes/mine', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT id, filename, content_type, byte_size, sha256, created_at
      FROM resume_files WHERE user_id=$1 ORDER BY created_at DESC
    `, [req.user.uid]);
    res.json(rows.rows);
  }));

  /* Download. Three things stand between this and a stored-XSS vector:
   *   1. Content-Type comes from RESUME_TYPES, keyed by the mime we stored
   *      after a magic-byte check — never reflected from the request or from
   *      an uploader-supplied string.
   *   2. Content-Disposition: attachment, with a filename stripped of quotes
   *      and newlines.
   *   3. nosniff, so a browser cannot decide for itself that the bytes look
   *      like HTML.
   */
  app.get('/api/resumes/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid resume id' });

    const row = await db.query(
      'SELECT id, user_id, filename, content_type, byte_size, content FROM resume_files WHERE id=$1', [id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Resume not found' });
    const file = row.rows[0];

    /* Authorisation, not merely authentication. A resume is readable by its
       owner, by an administrator, and by the person who posted a job this
       resume was attached to an application for — and by nobody else. Without
       the third clause the feature is useless; without the whole check, every
       resume on the platform is one incrementing id away from any account. */
    let allowed = file.user_id === req.user.uid || ADMIN_ROLES.includes(req.user.role);
    if (!allowed) {
      const viaApplication = await db.query(`
        SELECT 1 FROM job_applications a JOIN jobs j ON j.id = a.job_id
         WHERE a.resume_file_id = $1 AND j.posted_by_id = $2 LIMIT 1`, [id, req.user.uid]);
      allowed = viaApplication.rows.length > 0;
    }
    if (!allowed) return res.status(403).json({ error: 'You do not have access to this file' });

    const typeKey = Object.keys(RESUME_TYPES).find(k => RESUME_TYPES[k].mime === file.content_type);
    // A row whose stored mime is not in the allowlist predates or bypassed the
    // check; refuse rather than guess.
    if (!typeKey) return res.status(415).json({ error: 'This file has an unsupported stored type' });

    if (file.user_id !== req.user.uid) {
      await writeAudit('Resume Downloaded',
        `resume ${id} (owner ${file.user_id}) by user ${req.user.uid}`, '📄');
    }

    res.setHeader('Content-Type', RESUME_TYPES[typeKey].mime);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename(file.filename, typeKey)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', file.byte_size);
    res.end(file.content);
  }));

  app.delete('/api/resumes/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    // Owner only — an administrator deleting someone's evidence of an
    // application is not a capability this needs.
    const row = await db.query(
      'DELETE FROM resume_files WHERE id=$1 AND user_id=$2 RETURNING filename', [id, req.user.uid]);
    if (!row.rows.length) return res.status(404).json({ error: 'Resume not found' });
    // job_applications.resume_file_id is ON DELETE SET NULL, so the application
    // survives with its cover note and simply loses the attachment.
    await writeAudit('Resume Deleted', `${row.rows[0].filename} by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
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
