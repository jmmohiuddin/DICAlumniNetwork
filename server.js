/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   Express application — composition root.

   This file wires the application together and declares the routes that have
   not yet been extracted into src/server/modules/. Cross-cutting concerns now
   live in dedicated modules:

     src/server/config/     paths, .env loading, shared constants
     src/server/db/         PostgreSQL pool
     src/server/middleware/ authentication, RBAC guards
     src/server/shared/     HTTP helpers, serialisers
     src/server/modules/    per-domain route modules

   Route registration order is load-bearing: Express matches in the order
   routes are declared, and several concrete paths (/api/events/planner/:id,
   /api/events/proposals, ...) must be registered before the parameterised
   /api/events/:id routes that the modules declare. Run `npm run routes`
   and diff the output before and after any change to this file.
   ============================================================ */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const db = require('./src/server/db/pool');
const { INDEX_HTML } = require('./src/server/config/paths');
const {
  ADMIN_ROLES,
  MODERATOR_ROLES,
  SESSION_TTL_MS,
} = require('./src/server/config/constants');
const {
  hashPassword,
  verifyPassword,
  signToken,
  attachUser,
  requireAuth,
  requireRole,
} = require('./src/server/middleware/auth');
const { publicUser } = require('./src/server/shared/http');
const { staticAssets } = require('./src/server/middleware/static-assets');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(staticAssets());
app.use(attachUser);

// The hash-chained audit writer lives in the events module, which is mounted
// after the routes below are declared, so calls route through this late-bound
// shim. Until the mount runs it is a no-op — that window covers module load
// only, never a live request.
let _writeAudit = null;
async function writeAuditSafe(action, meta, icon) {
  if (typeof _writeAudit === 'function') {
    try { await _writeAudit(action, meta, icon); } catch { /* audit must never break a request */ }
  }
}


// ─── 1. HEALTH CHECK & CLOUD DB INITIALIZER ───
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time, COUNT(*) as user_count FROM users');
    res.json({
      status: 'online',
      database: db.isCloud ? 'Cloud PostgreSQL (SSL Active)' : 'PostgreSQL 16 (Local)',
      is_cloud: db.isCloud,
      time: result.rows[0].current_time,
      total_users: parseInt(result.rows[0].user_count)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message, is_cloud: db.isCloud });
  }
});

// Destructive: re-runs schema + seed. Super admin only.
app.post('/api/seed-db', requireRole('super_admin'), async (req, res) => {
  try {
    const result = await db.initDbSchemaAndSeed();
    res.json(result);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── 2. AUTHENTICATION ───
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);

    // One generic message for both unknown-email and wrong-password so the
    // endpoint cannot be used to enumerate accounts. The previous version
    // returned a super_admin session for any unrecognised address.
    if (result.rows.length === 0 || !verifyPassword(password, result.rows[0].password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const row = result.rows[0];

    // Transparently upgrade legacy plaintext rows on first successful login.
    if (!row.password_hash.startsWith('scrypt$')) {
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password), row.id]);
    }

    const user = publicUser(row);
    const token = signToken({ uid: user.id, role: user.role, exp: Date.now() + SESSION_TTL_MS });

    // Set on accounts that have no password of their own yet (bulk imports);
    // the client prompts for a change when this is set.
    res.json({ token, user, mustChangePassword: row.must_change_password === true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SELF-REGISTRATION ───
// The app previously offered sign-in only, so an alumnus who was not bulk
// imported had no way to get an account.
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, hscPassingYear, hscGroup, mobile, bloodGroup } = req.body || {};

  if (!name || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'A valid email address is required' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'An account with that email already exists. Try signing in instead.' });
    }

    const clean = name.trim();
    const initials = clean.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'AL';
    const year = parseInt(hscPassingYear) || null;
    const group = normalizeHscGroup(hscGroup) || 'General';

    // Self-registered accounts start unverified — an admin verifies them before
    // they are treated as confirmed alumni.
    const userRes = await client.query(`
      INSERT INTO users (email, password_hash, full_name, initials, role, role_label,
                         department, is_verified, must_change_password, created_via)
      VALUES ($1,$2,$3,$4,'alumni','Alumni Member',$5,FALSE,FALSE,'self_signup')
      RETURNING *
    `, [email.trim().toLowerCase(), hashPassword(password), clean, initials, group]);

    const uid = userRes.rows[0].id;
    await client.query(`
      INSERT INTO alumni_profiles (user_id, student_id, batch, passing_year, department,
                                   primary_email, mobile_number, blood_group, hsc_group,
                                   city, country)
      VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,'Dhaka','Bangladesh')
    `, [uid, year ? `DIC-${year}-${uid}` : `DIC-${uid}`, year, group,
        email.trim().toLowerCase(), (mobile || '').trim() || null,
        normalizeBloodGroup(bloodGroup), group]);

    await client.query(`
      INSERT INTO notifications (target_role, icon, title, subtitle)
      VALUES ('super_admin', '🎓', 'New Alumni Registration', $1)
    `, [`${clean} signed up and is awaiting verification.`]);

    await client.query('COMMIT');
    await writeAuditSafe('Alumni Self-Registered', `${clean} <${email.trim()}> awaiting verification`, '🎓');

    const user = publicUser(userRes.rows[0]);
    const token = signToken({ uid, role: user.role, exp: Date.now() + SESSION_TTL_MS });
    res.json({ token, user, mustChangePassword: false });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Lets a user (especially a bulk-imported one) replace the shared initial password.
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  try {
    const row = await db.query('SELECT * FROM users WHERE id = $1', [req.user.uid]);
    if (!row.rows.length) return res.status(404).json({ error: 'User not found' });
    if (!verifyPassword(currentPassword, row.rows[0].password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    await db.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hashPassword(newPassword), req.user.uid]
    );
    await writeAuditSafe('Password Changed', `user ${req.user.uid}`, '🔑');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restores a session on page load so a refresh does not dump the user back to
// the login screen.
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.uid]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Session user no longer exists' });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. ALUMNI DIRECTORY & PROFILES ───
// Directory listing. INNER JOIN on alumni_profiles so admin accounts without a
// profile stop appearing as rows of nulls, and every filter/sort/page is
// resolved in PostgreSQL rather than in the browser.
const ALUMNI_SORTS = {
  name:    'u.full_name ASC',
  recent:  'ap.batch DESC, u.full_name ASC',
  batch:   'ap.batch ASC, u.full_name ASC',
  company: 'ap.current_company ASC NULLS LAST, u.full_name ASC'
};

app.get('/api/alumni', requireAuth, async (req, res) => {
  const { search, dept, batch, domain, mentor, sort } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 12, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const where = [];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(LOWER(u.full_name) LIKE ${p} OR LOWER(ap.current_company) LIKE ${p}
              OR LOWER(ap.skills) LIKE ${p} OR LOWER(ap.department) LIKE ${p}
              OR LOWER(ap.job_title) LIKE ${p} OR LOWER(ap.city) LIKE ${p}
              OR CAST(ap.batch AS TEXT) LIKE ${p})`);
  }
  if (dept)   { params.push(`%${dept.toLowerCase()}%`); where.push(`LOWER(ap.department) LIKE $${params.length}`); }
  if (batch)  { params.push(parseInt(batch));           where.push(`ap.batch = $${params.length}`); }
  if (domain) { params.push(domain.toLowerCase());      where.push(`LOWER(ap.industry) = $${params.length}`); }
  if (mentor === 'true') where.push('ap.can_mentor = TRUE');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = ALUMNI_SORTS[sort] || ALUMNI_SORTS.name;

  try {
    const countRes = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM users u JOIN alumni_profiles ap ON u.id = ap.user_id
      ${whereSql}
    `, params);

    const rowsRes = await db.query(`
      SELECT u.id, u.full_name AS name, u.initials, u.is_verified AS verified,
             ap.job_title AS role, ap.current_company AS company, ap.batch,
             ap.department AS dept, ap.industry AS domain,
             NULLIF(CONCAT_WS(', ', ap.city, ap.country), '') AS location,
             ap.skills, ap.can_mentor AS mentor, ap.color, ap.student_id,
             ap.degree, ap.bio
      FROM users u JOIN alumni_profiles ap ON u.id = ap.user_id
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Contact details are intentionally excluded from list results; they are
    // served per-profile by /api/alumni/:id subject to privacy settings.
    const alumni = rowsRes.rows.map(r => ({
      ...r,
      color: r.color || '#00A859',
      location: r.location || 'Location not set',
      skills: r.skills ? r.skills.split(',').map(s => s.trim()).filter(Boolean) : []
    }));

    res.json({ alumni, total: countRes.rows[0].total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alumni/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(`
      SELECT u.id, u.full_name as name, u.email, u.role, u.initials, u.is_verified,
             ap.*
      FROM users u
      LEFT JOIN alumni_profiles ap ON u.id = ap.user_id
      WHERE u.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alumni profile not found' });
    }

    const row = result.rows[0];

    // Report what is actually stored. This previously substituted invented
    // constants ("Brain Station 23", "+880 1712-345678", a fixed skill list)
    // for every null column, so empty profiles looked fully populated.
    const privacy = row.privacy_settings || {};
    const isSelf = req.user && req.user.uid === row.id;
    const isStaff = req.user && ['super_admin', 'univ_admin', 'dept_admin'].includes(req.user.role);
    const canSee = (field) => isSelf || isStaff || privacy[field] !== 'private';

    res.json({
      id: row.id,
      name: row.name,
      initials: row.initials,
      email: canSee('email') ? (row.primary_email || row.email) : null,
      studentId: row.student_id,
      batch: row.batch,
      department: row.department,
      degree: row.degree,
      company: row.current_company,
      jobTitle: row.job_title,
      location: [row.city, row.country].filter(Boolean).join(', ') || null,
      bio: row.bio,
      skills: row.skills ? row.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
      mobile: canSee('mobile') ? row.mobile_number : null,
      linkedin: row.linkedin,
      github: row.github,
      website: row.website,
      verified: row.is_verified,
      canMentor: row.can_mentor,
      hiring: row.hiring,
      hasProfile: row.student_id !== null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROFILE SELF-SERVICE ───
// Returns the signed-in user's own profile with every field, unmasked.
app.get('/api/profile/me', requireAuth, async (req, res) => {
  try {
    const r = await db.query(`
      SELECT u.id, u.email, u.full_name, u.initials, u.role, u.role_label,
             u.department AS user_department, u.is_verified, u.must_change_password, u.created_via,
             ap.*
      FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE u.id = $1
    `, [req.user.uid]);
    if (!r.rows.length) return res.status(404).json({ error: 'Profile not found' });
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editable profile fields. Whitelisted so a caller cannot write arbitrary
// columns (role, verification status, etc.) by adding keys to the payload.
const EDITABLE_PROFILE_FIELDS = {
  bloodGroup:       'blood_group',
  presentAddress:   'present_address',
  permanentAddress: 'permanent_address',
  occupation:       'occupation',
  organization:     'current_company',   // "Current Organization / Institution"
  designation:      'job_title',         // "Current Designation"
  hscPassingYear:   'passing_year',
  hscGroup:         'hsc_group',
  hscVersion:       'hsc_version',
  photoUrl:         'photo_url',
  facebook:         'facebook',
  linkedin:         'linkedin',
  github:           'github',
  website:          'website',
  mobile:           'mobile_number',
  bio:              'bio',
  skills:           'skills',
  city:             'city',
  country:          'country'
};

app.put('/api/profile/me', requireAuth, async (req, res) => {
  const sets = [], vals = [req.user.uid];

  for (const [key, column] of Object.entries(EDITABLE_PROFILE_FIELDS)) {
    if (req.body[key] === undefined) continue;
    let value = req.body[key];

    if (key === 'bloodGroup') value = normalizeBloodGroup(value);
    else if (key === 'occupation') value = normalizeOccupation(value);
    else if (key === 'hscGroup') value = normalizeHscGroup(value);
    else if (key === 'hscPassingYear') value = parseInt(value) || null;
    else if (typeof value === 'string') value = value.trim() || null;

    vals.push(value);
    sets.push(`${column} = $${vals.length}`);
  }

  if (!sets.length) return res.status(400).json({ error: 'No editable fields supplied' });

  try {
    // passing_year and batch are kept in step so directory filters stay correct.
    if (req.body.hscPassingYear !== undefined) sets.push('batch = passing_year');

    const r = await db.query(`
      UPDATE alumni_profiles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 RETURNING *
    `, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Profile not found' });

    if (req.body.name && req.body.name.trim()) {
      await db.query('UPDATE users SET full_name = $2 WHERE id = $1', [req.user.uid, req.body.name.trim()]);
    }
    res.json({ success: true, profile: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. CHAPTERS & MEMBERSHIPS ───
app.get('/api/chapters', requireAuth, async (req, res) => {
  try {
    // members_count is derived from chapter_memberships rather than trusted
    // from the denormalised column, and is_member reflects the real session
    // user instead of a hardcoded Set([1, 3]) in the browser.
    const result = await db.query(`
      SELECT c.*,
             (SELECT COUNT(*)::int FROM chapter_memberships m WHERE m.chapter_id = c.id) AS member_rows,
             EXISTS (SELECT 1 FROM chapter_memberships m
                     WHERE m.chapter_id = c.id AND m.user_id = $1) AS is_member
      FROM chapters c
      WHERE c.status = 'approved'
      ORDER BY c.id ASC
    `, [req.user.uid]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Roles that may publish a chapter without review. Everyone else's submission
// enters the moderation queue — previously this was hardcoded to 'approved',
// which left the queue permanently empty.
const CHAPTER_AUTO_APPROVE_ROLES = ['super_admin', 'univ_admin', 'dept_admin'];

app.post('/api/chapters', requireAuth, async (req, res) => {
  const { name, type, icon, description, parentId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Chapter name is required' });
  }

  // Role and author come from the verified session, never from the request body.
  const createdByRole = req.user.role;
  const createdById = req.user.uid;
  const status = CHAPTER_AUTO_APPROVE_ROLES.includes(createdByRole) ? 'approved' : 'pending_review';

  try {
    const result = await db.query(`
      INSERT INTO chapters (name, type, icon, description, parent_id, status, created_by_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name.trim(), (type || 'regional').toLowerCase(), icon || '🏫', description || '',
        parentId || null, status, createdById || null]);

    // Surface the submission to moderators when it needs review.
    if (status === 'pending_review') {
      await db.query(`
        INSERT INTO notifications (target_role, icon, title, subtitle)
        VALUES ('super_admin', '🏫', 'New Chapter Awaiting Approval', $1)
      `, [`Chapter "${name.trim()}" was submitted for review.`]);
    }

    res.json({ chapter: result.rows[0], status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapters/:id/join', requireAuth, async (req, res) => {
  const chapterId = parseInt(req.params.id);
  const targetUserId = req.user.uid; // was `userId || 5` from the request body

  try {
    const check = await db.query('SELECT * FROM chapter_memberships WHERE chapter_id = $1 AND user_id = $2', [chapterId, targetUserId]);
    let joined = false;

    if (check.rows.length > 0) {
      // Leave chapter
      await db.query('DELETE FROM chapter_memberships WHERE chapter_id = $1 AND user_id = $2', [chapterId, targetUserId]);
      await db.query('UPDATE chapters SET members_count = GREATEST(1, members_count - 1) WHERE id = $1', [chapterId]);
      joined = false;
    } else {
      // Join chapter
      await db.query('INSERT INTO chapter_memberships (chapter_id, user_id) VALUES ($1, $2)', [chapterId, targetUserId]);
      await db.query('UPDATE chapters SET members_count = members_count + 1 WHERE id = $1', [chapterId]);
      joined = true;
    }

    const updatedChapter = await db.query('SELECT * FROM chapters WHERE id = $1', [chapterId]);
    res.json({ joined, chapter: updatedChapter.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/chapters/:id/members', requireAuth, async (req, res) => {
  const chapterId = parseInt(req.params.id);
  try {
    const result = await db.query(`
      SELECT u.id, u.full_name as name, u.initials, ap.job_title as role, ap.current_company as company,
             ap.batch, ap.department as dept
      FROM chapter_memberships cm
      JOIN users u ON cm.user_id = u.id
      LEFT JOIN alumni_profiles ap ON u.id = ap.user_id
      WHERE cm.chapter_id = $1
    `, [chapterId]);

    // A chapter with no memberships returns an empty list. It used to fall back
    // to four arbitrary users, which leaked people unrelated to the chapter.
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. STORIES & NEWS FEED ───
app.get('/api/stories', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM stories WHERE status = $1 ORDER BY id DESC', ['published']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stories', requireAuth, async (req, res) => {
  const { title, category, content, emoji } = req.body;

  if (!title || !title.trim() || !content || !content.trim()) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  // Author identity comes from the session, not the request body.
  const authorId = req.user.uid;
  const excerpt = content.length > 150 ? content.slice(0, 150) + '…' : content;

  try {
    const authorRow = await db.query('SELECT full_name FROM users WHERE id = $1', [authorId]);
    const authorName = authorRow.rows[0]?.full_name || 'DIC Alumni';

    const result = await db.query(`
      INSERT INTO stories (emoji, category, title, excerpt, content, author_id, author_name, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review')
      RETURNING *
    `, [emoji || '🌟', category || 'Alumni Story', title.trim(), excerpt, content.trim(), authorId, authorName]);

    await db.query(`
      INSERT INTO notifications (target_role, icon, title, subtitle)
      VALUES ('super_admin', '✐', 'New Story Submitted for Moderation', $1)
    `, [`Story "${title.trim()}" submitted by ${authorName}`]);

    res.json({ story: result.rows[0], status: 'pending_review' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. MODERATION QUEUE & APPROVALS ───
app.get('/api/moderation', requireRole(...MODERATOR_ROLES), async (req, res) => {
  try {
    const pendingChapters = await db.query('SELECT * FROM chapters WHERE status = $1 ORDER BY id DESC', ['pending_review']);
    const pendingStories = await db.query('SELECT * FROM stories WHERE status = $1 ORDER BY id DESC', ['pending_review']);
    const pendingProposals = await db.query('SELECT * FROM event_proposals WHERE status = $1 ORDER BY id DESC', ['pending_approval']);
    res.json({
      pendingChapters: pendingChapters.rows,
      pendingStories: pendingStories.rows,
      pendingProposals: pendingProposals.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/moderation/chapter/:id/:action', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const id = parseInt(req.params.id);
  const action = req.params.action; // approve or reject
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  try {
    const result = await db.query('UPDATE chapters SET status = $1 WHERE id = $2 RETURNING *', [newStatus, id]);
    
    // Notify alumni
    await db.query(`
      INSERT INTO notifications (user_id, icon, title, subtitle)
      VALUES (5, '🏫', $1, $2)
    `, [
      `Chapter ${action === 'approve' ? 'Approved ✓' : 'Rejected ❌'}`,
      `Your chapter submission "${result.rows[0]?.name}" was ${newStatus}.`
    ]);

    res.json({ success: true, chapter: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/moderation/story/:id/:action', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const id = parseInt(req.params.id);
  const action = req.params.action;
  const newStatus = action === 'approve' ? 'published' : 'rejected';

  try {
    const result = await db.query('UPDATE stories SET status = $1 WHERE id = $2 RETURNING *', [newStatus, id]);
    
    // Notify alumni
    await db.query(`
      INSERT INTO notifications (user_id, icon, title, subtitle)
      VALUES (5, '✐', $1, $2)
    `, [
      `Story ${action === 'approve' ? 'Published ✓' : 'Rejected ❌'}`,
      `Your story "${result.rows[0]?.title}" was ${newStatus}.`
    ]);

    res.json({ success: true, story: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/moderation/proposal/:id/:action', requireRole(...ADMIN_ROLES), async (req, res) => {
  const id = parseInt(req.params.id);
  const approve = req.params.action === 'approve';
  const newStatus = approve ? 'approved' : 'draft';

  try {
    const result = await db.query(
      'UPDATE event_proposals SET status = $1 WHERE id = $2 RETURNING *',
      [newStatus, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Proposal not found' });

    await db.query(`
      INSERT INTO notifications (target_role, icon, title, subtitle)
      VALUES ('alumni', '🎪', $1, $2)
    `, [
      `Event Proposal ${approve ? 'Approved ✓' : 'Sent Back ↩'}`,
      `"${result.rows[0].name}" was ${approve ? 'approved and moved into planning' : 'returned to draft for revision'}.`
    ]);

    res.json({ success: true, proposal: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. NOTIFICATIONS ───
// Scoped to the caller: direct notifications (user_id), role broadcasts
// (target_role), and system-wide notices (both null). Previously this returned
// every row in the table to every user.
app.get('/api/notifications', requireAuth, async (req, res) => {
  // Scope comes from the verified session. Taking userId/role from the query
  // string would let any signed-in user read someone else's notifications.
  const userId = req.user.uid;
  const role = req.user.role;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  try {
    const result = await db.query(`
      SELECT * FROM notifications
      WHERE ($1::int IS NOT NULL AND user_id = $1)
         OR ($2::text IS NOT NULL AND target_role = $2)
         OR (user_id IS NULL AND target_role IS NULL)
      ORDER BY created_at DESC, id DESC
      LIMIT $3
    `, [userId, role, limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    // The WHERE clause also enforces ownership, so one user cannot mark
    // another user's notification as read.
    const result = await db.query(`
      UPDATE notifications SET is_unread = FALSE
      WHERE id = $1
        AND (user_id = $2 OR target_role = $3 OR (user_id IS NULL AND target_role IS NULL))
      RETURNING *
    `, [parseInt(req.params.id), req.user.uid, req.user.role]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/read-all', requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const role = req.user.role;
  try {
    const result = await db.query(`
      UPDATE notifications SET is_unread = FALSE
      WHERE is_unread = TRUE
        AND (($1::int IS NOT NULL AND user_id = $1)
          OR ($2::text IS NOT NULL AND target_role = $2)
          OR (user_id IS NULL AND target_role IS NULL))
      RETURNING id
    `, [userId || null, role || null]);
    res.json({ success: true, updated: result.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. BULK USER IMPORT ───
/* ─── IMPORT NORMALISERS ───
   Intake forms collect free text. The reunion CSV had 32 distinct spellings
   for 8 real blood groups ("0+" with a zero, "A positive", "Ab+", "AbB+",
   "O' possative"), so values are canonicalised here rather than stored raw.
   Anything unrecognised becomes 'Unknown' — it never fails the import. */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function normalizeBloodGroup(raw) {
  if (!raw || !String(raw).trim()) return null;
  let s = String(raw).trim().toUpperCase();

  // Strip punctuation/whitespace and expand written-out signs.
  s = s.replace(/[()'`.\s]/g, '');
  s = s.replace(/POSSATIVE|POSITIVE|POSITIVR|POSTIVE|POS(?![A-Z])|PLUS/g, '+');
  s = s.replace(/NEGATIVE|NEGETIVE|NEG(?![A-Z])|MINUS/g, '-');
  s = s.replace(/VE$/, '');            // "A+VE" -> "A+"
  s = s.replace(/^0/, 'O');            // digit zero typed for the letter O
  s = s.replace(/ABB/g, 'AB');         // "AbB+" typo
  s = s.replace(/\++/g, '+').replace(/-+/g, '-');

  // Pull the group letters and the sign out of whatever is left.
  const letters = (s.match(/AB|A|B|O/) || [])[0];
  const sign = s.includes('+') ? '+' : (s.includes('-') ? '-' : '');
  if (!letters) return 'Unknown';

  // No rhesus sign means the value is genuinely unknown. Guessing '+' on a
  // medical field used for emergency matching would be unsafe.
  if (!sign) return 'Unknown';
  const candidate = letters + sign;
  return BLOOD_GROUPS.includes(candidate) ? candidate : 'Unknown';
}

function normalizeOccupation(raw) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.startsWith('student')) return 'Student';
  if (s.startsWith('job') || s.includes('service') || s.includes('employ')) return 'Job';
  if (s.startsWith('business') || s.includes('entrepreneur')) return 'Business';
  return 'Others';
}

function normalizeHscGroup(raw) {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.startsWith('sci')) return 'Science';
  if (s.includes('b. studies') || s.includes('business') || s.includes('commerce')) return 'Business Studies';
  if (s.includes('human') || s.includes('arts')) return 'Humanities';
  return String(raw).trim();
}

function normalizeMobile(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  // Bangladeshi numbers: keep the last 10 significant digits as the match key.
  return digits.slice(-10);
}

function isValidEmail(e) {
  return typeof e === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e.trim());
}

// Intake forms produce sloppy addresses. Recovers the common damage rather
// than rejecting the row: "a.tafsina@ Gmail.com" (space after @) and
// "x@gmail.com x@gmail.com" (pasted twice) both appeared in the reunion CSV.
function sanitizeEmail(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/[\u00a0\s]+/g, " ");                 // normalise whitespace

  // If several tokens were pasted, keep the first that looks like an address.
  const tokens = s.split(" ").filter(Boolean);
  const token = tokens.find(t => t.includes("@"));
  if (token && tokens.length > 1 && isValidEmail(token)) return token;

  s = s.replace(/\s+/g, "");                           // "a@ gmail.com" -> "a@gmail.com"
  s = s.replace(/^mailto:/, "").replace(/[,;]+$/, "");
  return s || null;
}

app.post('/api/bulk-import', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { records, filename, adminName, failedCount, duplicateCount, processingTime } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records must be an array' });
  }

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    let created = 0, updated = 0, skippedDuplicate = 0, rejected = 0;
    const rejectedRows = [];
    let withMissingOptional = 0;
    const missingFieldCounts = {};
    const OPTIONAL_FIELDS = ["mobile","hscPassingYear","hscGroup","hscVersion","bloodGroup",
                             "presentAddress","occupation","organization","designation",
                             "photoUrl","facebook"];
    const seenEmail = new Set(), seenMobile = new Set();
    const strategy = (req.body.dupResolution || "skip").toLowerCase();

    for (const r of records) {
      const rowNo = r.row || 0;
      const name = (r.name || "").trim();
      const email = sanitizeEmail(r.email);

      // Maximum retention: only reject when the row cannot be saved at all.
      // users.email is UNIQUE NOT NULL and is the login identifier, so an
      // unrecoverable address is the one genuinely fatal case. Every other
      // blank field is stored as NULL.
      if (!name) { rejected++; rejectedRows.push({ row: rowNo, name, email, error: "Missing name (cannot identify the person)" }); continue; }
      if (!isValidEmail(email)) { rejected++; rejectedRows.push({ row: rowNo, name, email: r.email, error: "Email could not be recovered (required as the unique login identifier)" }); continue; }

      // Record blanks for reporting; they never block the import.
      let missedAny = false;
      for (const f of OPTIONAL_FIELDS) {
        if (!r[f] || !String(r[f]).trim()) {
          missingFieldCounts[f] = (missingFieldCounts[f] || 0) + 1;
          missedAny = true;
        }
      }
      if (missedAny) withMissingOptional++;

      const mobileKey = normalizeMobile(r.mobile);

      // Same person appearing twice in the file. Under the "update" strategy
      // the later submission is allowed through so it can enrich the profile
      // created by the first — people resubmit the form to correct or complete
      // their entry, and discarding that loses real data.
      const isBatchDuplicate = seenEmail.has(email) || (mobileKey && seenMobile.has(mobileKey));
      if (isBatchDuplicate && strategy === "skip") { skippedDuplicate++; continue; }
      seenEmail.add(email);
      if (mobileKey) seenMobile.add(mobileKey);

      // Duplicates against existing accounts — email first, then mobile.
      const existing = await client.query(
        `SELECT u.id FROM users u
         LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
         WHERE LOWER(u.email) = $1
            OR ($2::text IS NOT NULL AND RIGHT(REGEXP_REPLACE(COALESCE(ap.mobile_number,''), '\\D', '', 'g'), 10) = $2)
         LIMIT 1`,
        [email, mobileKey]
      );

      const year = parseInt(r.hscPassingYear) || null;
      const profileVals = [
        year,                                   // batch + passing_year
        normalizeBloodGroup(r.bloodGroup),
        (r.presentAddress || "").trim() || null,
        normalizeOccupation(r.occupation),
        (r.organization || "").trim() || null,  // Current Organization / Institution
        (r.designation || "").trim() || null,   // Current Designation
        normalizeHscGroup(r.hscGroup),
        (r.hscVersion || "").trim() || null,
        (r.photoUrl || "").trim() || null,
        (r.facebook || "").trim() || null,
        (r.mobile || "").trim() || null
      ];

      if (existing.rows.length > 0) {
        if (strategy === "skip") { skippedDuplicate++; continue; }
        // Non-null values from this row overwrite; blanks leave the stored
        // value intact (COALESCE below), so nothing is lost either way.
        // update / merge: refresh the profile, never touch the password.
        const uid = existing.rows[0].id;
        await client.query(
          `UPDATE alumni_profiles SET
             batch = COALESCE($2, batch), passing_year = COALESCE($2, passing_year),
             blood_group = COALESCE($3, blood_group), present_address = COALESCE($4, present_address),
             occupation = COALESCE($5, occupation), current_company = COALESCE($6, current_company),
             job_title = COALESCE($7, job_title), hsc_group = COALESCE($8, hsc_group),
             hsc_version = COALESCE($9, hsc_version), photo_url = COALESCE($10, photo_url),
             facebook = COALESCE($11, facebook), mobile_number = COALESCE($12, mobile_number),
             updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
          [uid, ...profileVals]
        );
        updated++;
        continue;
      }

      // New account. No shared credential is issued: each row gets its own
      // random secret, hashed with scrypt and then discarded, so the row has no
      // password anyone (including this process) can present. The account stays
      // unverified and flagged must_change_password until a password is
      // properly provisioned for it.
      const passwordHash = hashPassword(crypto.randomBytes(32).toString('hex'));
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2)
        .map(w => w[0]).join("").toUpperCase().slice(0, 2) || "AL";

      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, initials, role, role_label,
                            department, is_verified, must_change_password, created_via)
         VALUES ($1,$2,$3,$4,'alumni','Alumni Member',$5,FALSE,TRUE,'bulk_import')
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [email, passwordHash, name, initials, normalizeHscGroup(r.hscGroup) || "General"]
      );
      if (userRes.rows.length === 0) { skippedDuplicate++; continue; }
      const uid = userRes.rows[0].id;

      await client.query(
        `INSERT INTO alumni_profiles
           (user_id, student_id, batch, passing_year, department, primary_email,
            blood_group, present_address, occupation, current_company, job_title,
            hsc_group, hsc_version, photo_url, facebook, mobile_number, city, country)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Dhaka','Bangladesh')`,
        [uid, year ? `DIC-${year}-${uid}` : `DIC-${uid}`, year,
         normalizeHscGroup(r.hscGroup) || "General", email,
         profileVals[1], profileVals[2], profileVals[3], profileVals[4], profileVals[5],
         profileVals[6], profileVals[7], profileVals[8], profileVals[9], profileVals[10]]
      );
      created++;
    }

    await client.query(
      `INSERT INTO import_history (batch_code, filename, total_records, success_count,
                                   failed_count, duplicate_count, admin_name, processing_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`BATCH-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,
       filename || "import.csv", records.length, created,
       rejected, skippedDuplicate, adminName || "Admin", processingTime || "—"]
    );

    await client.query("COMMIT");

    await writeAuditSafe("Bulk Import Completed",
      `${filename || "import.csv"}: ${created} created, ${updated} updated, ${skippedDuplicate} duplicates, ${rejected} rejected`);

    res.json({
      success: true,
      total: records.length,
      count: created, created, updated,
      skipped: skippedDuplicate, duplicates: skippedDuplicate,
      rejected, rejectedRows: rejectedRows.slice(0, 100),
      withMissingOptional, missingFieldCounts
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Import audit trail — the wizard used to keep this in a local array only.
app.get('/api/import-history', requireRole(...ADMIN_ROLES), async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM import_history ORDER BY created_at DESC, id DESC LIMIT 25');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 10. EVENT MANAGEMENT PLANNER WORKSPACE ENDPOINTS ───
app.get('/api/events/planner/:id', requireAuth, async (req, res) => {
  const eventId = parseInt(req.params.id) || 1;
  try {
    const proposal = await db.query('SELECT * FROM event_proposals WHERE id = $1 LIMIT 1', [eventId]);
    const budgets = await db.query('SELECT * FROM event_budgets WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const sponsors = await db.query('SELECT * FROM event_sponsors WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const committees = await db.query('SELECT * FROM event_committees WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const tasks = await db.query('SELECT * FROM event_tasks WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const procurement = await db.query('SELECT * FROM event_procurement WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const volunteers = await db.query('SELECT * FROM event_volunteers WHERE event_id = $1 ORDER BY id ASC', [eventId]);
    const risks = await db.query('SELECT * FROM event_risks WHERE event_id = $1 ORDER BY id ASC', [eventId]);

    res.json({
      proposal: proposal.rows[0] || null,
      budgets: budgets.rows,
      sponsors: sponsors.rows,
      committees: committees.rows,
      tasks: tasks.rows,
      procurement: procurement.rows,
      volunteers: volunteers.rows,
      risks: risks.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/proposals', requireAuth, async (req, res) => {
  const { name, description, objectives, category, type, venue, eventDate, expectedAttendance } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO event_proposals (name, description, objectives, category, type, venue, event_date, expected_attendance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_approval')
      RETURNING *
    `, [name, description, objectives, category || 'Alumni Gala', type || 'Reunion', venue || 'DIC Auditorium', eventDate || 'Aug 15, 2026', expectedAttendance || 500]);

    await db.query(`
      INSERT INTO notifications (target_role, icon, title, subtitle)
      VALUES ('super_admin', '🎪', 'New Event Proposal Awaiting Approval', $1)
    `, [`Event proposal "${name}" was submitted for review.`]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/budgets', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const { eventId, category, estimatedCost, actualCost, vendorName } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO event_budgets (event_id, category, estimated_cost, actual_cost, vendor_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [eventId || 1, category, estimatedCost || 0, actualCost || 0, vendorName || 'Direct Vendor']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/sponsors', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const { eventId, company, contactPerson, packageTier, contributionAmount, pipelineStatus } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO event_sponsors (event_id, company, contact_person, package_tier, contribution_amount, pipeline_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [eventId || 1, company, contactPerson || 'Contact Lead', packageTier || 'gold', contributionAmount || 100000, pipelineStatus || 'agreed']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/tasks', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const { eventId, committeeName, title, description, priority, status, assignedTo, deadline } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO event_tasks (event_id, committee_name, title, description, priority, status, assigned_to, deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [eventId || 1, committeeName || 'General', title, description || '', priority || 'medium', status || 'todo', assignedTo || 'Unassigned', deadline || 'Aug 10, 2026']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/tasks/:id/status', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const taskId = parseInt(req.params.id);
  const { status } = req.body;
  try {
    const result = await db.query('UPDATE event_tasks SET status = $1 WHERE id = $2 RETURNING *', [status, taskId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/procurement', requireRole(...MODERATOR_ROLES), async (req, res) => {
  const { eventId, itemName, category, quantity, estimatedPrice, actualPrice, vendorName, deliveryStatus } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO event_procurement (event_id, item_name, category, quantity, estimated_price, actual_price, vendor_name, delivery_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [eventId || 1, itemName, category || 'General', quantity || 1, estimatedPrice || 0, actualPrice || 0, vendorName || 'Vendor', deliveryStatus || 'delivered']);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/ai-estimate', (req, res) => {
  const { attendance, eventType } = req.body;
  const pax = parseInt(attendance) || 500;
  
  const estimatedBudget = pax * 450; // ৳450 per head
  const venueCost = Math.round(estimatedBudget * 0.25);
  const foodCost = Math.round(estimatedBudget * 0.40);
  const techCost = Math.round(estimatedBudget * 0.15);
  const merchandiseCost = Math.round(estimatedBudget * 0.10);
  const miscCost = Math.round(estimatedBudget * 0.10);

  res.json({
    recommendedBudget: estimatedBudget,
    breakdown: {
      venue: venueCost,
      food: foodCost,
      stageTech: techCost,
      merchandise: merchandiseCost,
      miscellaneous: miscCost
    },
    suggestedTimeline: [
      { week: 'Week 1', milestone: 'Submit Proposal & Confirm Venue Booking' },
      { week: 'Week 2', milestone: 'Finalize Title & Gold Sponsors (Target: ৳5L+)' },
      { week: 'Week 3', milestone: 'Launch Ticketing & Omnichannel Campaign' },
      { week: 'Week 4', milestone: 'Procure Welcome Kits, Badges & T-Shirts' },
      { week: 'Week 5', milestone: 'Volunteer Shift Briefing & Stage Sound Check' },
      { week: 'Week 6', milestone: 'Event Execution Day & Live QR Registration' }
    ],
    riskRecommendations: [
      'Ensure 250kVA standby diesel generator is reserved for evening keynote.',
      'Deploy 25+ volunteers for check-in to maintain <45s queue times.',
      'Prepare indoor gym backup location in case of monsoon rain.'
    ]
  });
});

/* ============================================================
   MOUNTED ROUTE MODULES
   Registered before the SPA catch-all so /api/* resolves first.
   ============================================================ */

const guards = { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES };

// v2: events, ticketing, jobs, campaigns/donations, custom fields,
// mentorship, connections, polls, broadcasts, audit log.
const v2 = require('./src/server/modules')(app, guards);
_writeAudit = v2.writeAudit;   // late-bind the audit writer declared above

// Event Management Planner (Phase 6).
require('./src/server/modules/planner/routes')(app, { ...guards, writeAudit: v2.writeAudit });

// PDPA 2026 / CA 2023 compliance: consent, encrypted vault, DSAR.
require('./src/server/modules/compliance/routes')(app, {
  ...guards,
  encryptField: v2.encryptField,
  decryptField: v2.decryptField,
  encryptionReady: v2.encryptionReady,
  writeAudit: v2.writeAudit
});

// Unknown /api/* paths must 404 as JSON, not fall through to the SPA shell.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.originalUrl}` });
});

// A request for a real file that does not exist must 404, not fall through to
// the SPA shell. Returning index.html for a missing image made <img onerror>
// fallbacks download the whole page before failing to decode it.
const STATIC_FILE = /\.(sql|lock|md|png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|json|txt|csv|woff2?|ttf|otf|eot|pdf|xml)$/i;
app.use((req, res, next) => {
  if (STATIC_FILE.test(req.path)) {
    return res.status(404).type('txt').send('Not found');
  }
  next();
});

// Serve frontend SPA for all remaining routes
app.use((req, res) => {
  res.sendFile(INDEX_HTML);
});

// Start Express Server locally or export for Vercel Serverless
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 DIC Alumni Platform API Server running on http://localhost:${PORT}`);
    console.log(`🐘 Connected to PostgreSQL Database "dic_alumni_db"`);
  });
}

module.exports = app;
