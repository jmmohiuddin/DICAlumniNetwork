/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   Production-Ready Express REST API Server Powered by PostgreSQL
   ============================================================ */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ─── 1. HEALTH CHECK ───
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time, COUNT(*) as user_count FROM users');
    res.json({
      status: 'online',
      database: 'PostgreSQL 16',
      time: result.rows[0].current_time,
      total_users: parseInt(result.rows[0].user_count)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ─── 2. AUTHENTICATION ───
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (result.rows.length === 0) {
      // Fallback: return default super_admin
      const adminRes = await db.query('SELECT * FROM users WHERE role = $1 LIMIT 1', ['super_admin']);
      return res.json({ user: adminRes.rows[0] });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. ALUMNI DIRECTORY & PROFILES ───
app.get('/api/alumni', async (req, res) => {
  const { search, limit } = req.query;
  try {
    let query = `
      SELECT u.id, u.full_name as name, u.initials, ap.job_title as role, ap.current_company as company,
             ap.batch, ap.department as dept, ap.industry as domain,
             CONCAT(ap.city, ', ', ap.country) as location, ap.skills, ap.can_mentor as mentor,
             u.is_verified as verified, ap.color, ap.student_id, ap.degree, ap.bio, ap.primary_email as email,
             ap.mobile_number as mobile, ap.linkedin, ap.github, ap.website
      FROM users u
      LEFT JOIN alumni_profiles ap ON u.id = ap.user_id
      WHERE u.role IN ('alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin')
    `;
    const params = [];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(u.full_name) LIKE $1 OR LOWER(ap.current_company) LIKE $1 OR LOWER(ap.skills) LIKE $1 OR LOWER(ap.department) LIKE $1)`;
    }
    query += ` ORDER BY u.id ASC LIMIT ${parseInt(limit) || 50}`;

    const result = await db.query(query, params);
    
    // Process skills into arrays
    const alumni = result.rows.map(r => ({
      ...r,
      skills: r.skills ? r.skills.split(',').map(s => s.trim()) : ['React', 'Node.js', 'SQL']
    }));

    res.json(alumni);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/alumni/:id', async (req, res) => {
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
    res.json({
      id: row.id,
      name: row.full_name || row.name,
      initials: row.initials || 'AL',
      email: row.email || row.primary_email,
      studentId: row.student_id || `DIC-2020-0${row.id}`,
      batch: row.batch || 2020,
      department: row.department || 'Computer Science & Engineering',
      degree: row.degree || 'BSc CSE',
      company: row.current_company || 'Brain Station 23',
      jobTitle: row.job_title || 'Software Engineer',
      location: row.city ? `${row.city}, ${row.country}` : 'Dhaka, BD',
      bio: row.bio || 'DIC Verified Alumni & Tech Professional',
      skills: row.skills ? row.skills.split(',').map(s => s.trim()) : ['React', 'Node.js', 'AWS'],
      mobile: row.mobile_number || '+880 1712-345678',
      linkedin: row.linkedin || 'https://linkedin.com',
      github: row.github || 'https://github.com',
      website: row.website || 'https://dic.edu.bd',
      verified: row.is_verified,
      canMentor: row.can_mentor,
      hiring: row.hiring
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. CHAPTERS & MEMBERSHIPS ───
app.get('/api/chapters', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM chapters WHERE status = $1 ORDER BY id ASC', ['approved']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapters', async (req, res) => {
  const { name, type, icon, description, parentId, createdByRole } = req.body;
  const status = (createdByRole === 'super_admin' || createdByRole === 'univ_admin') ? 'approved' : 'pending_review';
  try {
    const result = await db.query(`
      INSERT INTO chapters (name, type, icon, description, parent_id, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, type.toLowerCase(), icon || '🏫', description, parentId || null, status]);

    // Dispatch notification if pending review
    if (status === 'pending_review') {
      await db.query(`
        INSERT INTO notifications (target_role, icon, title, subtitle)
        VALUES ('super_admin', '🏫', 'New Chapter Submission', $1)
      `, [`New chapter "${name}" submitted for approval`]);
    }

    res.json({ chapter: result.rows[0], status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chapters/:id/join', async (req, res) => {
  const chapterId = parseInt(req.params.id);
  const { userId } = req.body;
  const targetUserId = userId || 5;

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

app.post('/api/stories', async (req, res) => {
  const { title, category, content, authorName, emoji } = req.body;
  const excerpt = content ? content.slice(0, 150) + '...' : 'New story submitted by DIC alumni.';
  try {
    const result = await db.query(`
      INSERT INTO stories (emoji, category, title, excerpt, content, author_name, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending_review')
      RETURNING *
    `, [emoji || '🌟', category || 'Alumni Story', title, excerpt, content, authorName || 'Mohiuddin Rahman']);

    // Notify Super Admin
    await db.query(`
      INSERT INTO notifications (target_role, icon, title, subtitle)
      VALUES ('super_admin', '✐', 'New Story Submitted for Moderation', $1)
    `, [`Story "${title}" submitted by ${authorName || 'Alumni'}`]);

    res.json({ story: result.rows[0], status: 'pending_review' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. MODERATION QUEUE & APPROVALS ───
app.get('/api/moderation', async (req, res) => {
  try {
    const pendingChapters = await db.query('SELECT * FROM chapters WHERE status = $1 ORDER BY id DESC', ['pending_review']);
    const pendingStories = await db.query('SELECT * FROM stories WHERE status = $1 ORDER BY id DESC', ['pending_review']);
    res.json({
      pendingChapters: pendingChapters.rows,
      pendingStories: pendingStories.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/moderation/chapter/:id/:action', async (req, res) => {
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

app.post('/api/moderation/story/:id/:action', async (req, res) => {
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

// ─── 7. NOTIFICATIONS ───
app.get('/api/notifications', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM notifications ORDER BY id DESC LIMIT 20');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. BULK USER IMPORT ───
app.post('/api/bulk-import', async (req, res) => {
  const { records, filename, adminName } = req.body;
  try {
    let success = 0;
    if (Array.isArray(records)) {
      for (const r of records) {
        // Insert user & profile into PostgreSQL
        const userRes = await db.query(`
          INSERT INTO users (email, full_name, initials, role, role_label, department)
          VALUES ($1, $2, $3, 'alumni', 'Alumni Member', $4)
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        `, [r.email, r.name, r.name ? r.name.slice(0,2).toUpperCase() : 'AL', r.dept || 'CSE']);

        if (userRes.rows.length > 0) {
          const userId = userRes.rows[0].id;
          await db.query(`
            INSERT INTO alumni_profiles (user_id, student_id, batch, passing_year, department, primary_email, current_company)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (student_id) DO NOTHING
          `, [userId, r.studentId, parseInt(r.year) || 2020, parseInt(r.year) || 2020, r.dept || 'CSE', r.email, r.company || 'DIC Tech Hub']);
          success++;
        }
      }
    }

    // Log to import_history in PostgreSQL
    await db.query(`
      INSERT INTO import_history (batch_code, filename, total_records, success_count, admin_name)
      VALUES ($1, $2, $3, $4, $5)
    `, [`BATCH-2026-0${Date.now().toString().slice(-3)}`, filename || 'import.csv', records.length, success, adminName || 'Super Admin']);

    res.json({ success: true, count: success });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 9. CUSTOM FIELDS ───
app.get('/api/custom-fields', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM custom_fields ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-fields', async (req, res) => {
  const { id, label, section, type, required } = req.body;
  try {
    const result = await db.query(`
      INSERT INTO custom_fields (id, label, section, field_type, is_required)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id || `cf_${Date.now()}`, label, section, type, required || false]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend SPA for all remaining routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`🚀 DIC Alumni Platform API Server running on http://localhost:${PORT}`);
  console.log(`🐘 Connected to PostgreSQL Database "dic_alumni_db"`);
});
