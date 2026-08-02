/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   Production-Ready Express REST API Server Powered by PostgreSQL
   ============================================================ */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const db = require('./db');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

/* ============================================================
   AUTHENTICATION — password hashing, signed sessions, RBAC
   ============================================================ */

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('⚠  SESSION_SECRET not set — using an ephemeral secret. ' +
               'Sessions will be invalidated on restart. Set SESSION_SECRET in .env for production.');
}
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Passwords are stored as `scrypt$<salt>$<derived>`. Seed rows still hold the
// legacy plaintext '12345678', so verifyPassword accepts those once and the
// login handler transparently re-hashes them.
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) {
    // Legacy plaintext row — constant-time compare, then caller upgrades it.
    const a = Buffer.from(String(plain));
    const b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, salt, expected] = stored.split('$');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Attaches req.user when a valid token is present; never rejects.
function attachUser(req, res, next) {
  req.user = verifyToken(readToken(req));
  next();
}
app.use(attachUser);

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

const ADMIN_ROLES = ['super_admin', 'univ_admin'];
const MODERATOR_ROLES = ['super_admin', 'univ_admin', 'dept_admin', 'moderator'];

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    initials: row.initials,
    role: row.role,
    roleLabel: row.role_label,
    dept: row.department,
    icon: row.icon,
    verified: row.is_verified
  };
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

    res.json({ token, user });
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

app.get('/api/chapters/:id/members', async (req, res) => {
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

    if (result.rows.length === 0) {
      // Return default members
      const defaults = await db.query('SELECT u.id, u.full_name as name, u.initials, ap.job_title as role, ap.current_company as company, ap.batch, ap.department as dept FROM users u LEFT JOIN alumni_profiles ap ON u.id = ap.user_id LIMIT 4');
      return res.json(defaults.rows);
    }
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
app.post('/api/bulk-import', requireRole(...ADMIN_ROLES), async (req, res) => {
  const { records, filename, adminName, failedCount, duplicateCount, processingTime } = req.body;

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: 'records must be an array' });
  }

  // The whole batch commits or none of it does, so a failure part-way through
  // cannot leave orphaned users without profiles.
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let success = 0, skipped = 0;

    for (const r of records) {
      if (!r.email || !r.name) { skipped++; continue; }

      const userRes = await client.query(`
        INSERT INTO users (email, full_name, initials, role, role_label, department)
        VALUES ($1, $2, $3, 'alumni', 'Alumni Member', $4)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `, [r.email, r.name, r.name.slice(0, 2).toUpperCase(), r.dept || 'CSE']);

      if (userRes.rows.length === 0) { skipped++; continue; }

      const year = parseInt(r.year) || new Date().getFullYear();
      await client.query(`
        INSERT INTO alumni_profiles (user_id, student_id, batch, passing_year, department,
                                     primary_email, current_company, job_title, city, country)
        VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (student_id) DO NOTHING
      `, [userRes.rows[0].id, r.studentId || `DIC-${year}-${userRes.rows[0].id}`, year,
          r.dept || 'CSE', r.email, r.company || null, r.role || null,
          r.city || 'Dhaka', r.country || 'Bangladesh']);
      success++;
    }

    await client.query(`
      INSERT INTO import_history (batch_code, filename, total_records, success_count,
                                  failed_count, duplicate_count, admin_name, processing_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [`BATCH-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,
        filename || 'import.csv', records.length, success,
        parseInt(failedCount) || 0, parseInt(duplicateCount) || skipped,
        adminName || 'Admin', processingTime || '—']);

    await client.query('COMMIT');
    res.json({ success: true, count: success, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
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
app.get('/api/events/planner/:id', async (req, res) => {
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
const v2 = require('./routes_v2')(app, guards);

// Event Management Planner (Phase 6).
require('./routes_planner')(app, { ...guards, writeAudit: v2.writeAudit });

// PDPA 2026 / CA 2023 compliance: consent, encrypted vault, DSAR.
require('./routes_compliance')(app, {
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

// Serve frontend SPA for all remaining routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server locally or export for Vercel Serverless
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 DIC Alumni Platform API Server running on http://localhost:${PORT}`);
    console.log(`🐘 Connected to PostgreSQL Database "dic_alumni_db"`);
  });
}

module.exports = app;
